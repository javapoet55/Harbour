import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import type { Prisma } from '@/generated/prisma';
import { MomentError, editableStatuses } from './domain';

// The finished card as the user sees it. Stored in the database: Railway's filesystem is ephemeral,
// and the repo already keeps profile photos and shopping images in rows.
export const CARD_MAX_BYTES = 1_500_000;
const cardTypes = ['birthday', 'anniversary', 'festival', 'getWellSoon'];
const metadata = { id: true, mime: true, size: true, sha256: true, createdAt: true } as const;

export function cardMime(bytes: Uint8Array) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte)) return 'image/png';
  return null;
}

/** The card a new email delivery should carry: the moment's current (latest, not deleted) card. */
export async function latestCardId(momentId: string, db: Prisma.TransactionClient = prisma) {
  return (await db.greetingCardImage.findFirst({ where: { momentId, retiredAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } }))?.id ?? null;
}

/**
 * Stores a newly saved card and points the moment's not-yet-sent email deliveries at it. A delivery
 * already being sent keeps the card it started with; cards no delivery references any more are removed.
 */
export async function saveCardImage(userId: string, momentId: string, bytes: Uint8Array<ArrayBuffer>) {
  if (!bytes.length) throw new MomentError('Choose a card image to save.');
  if (bytes.length > CARD_MAX_BYTES) throw new MomentError('The card image is too large. Save it at a smaller size (1.5 MB at most).', 413);
  const mime = cardMime(bytes);
  if (!mime) throw new MomentError('Save the card as a JPEG or PNG image.', 415);
  const moment = await prisma.importantMoment.findFirst({ where: { id: momentId, userId, type: { in: cardTypes } }, select: { id: true } });
  if (!moment) throw new MomentError('Moment not found.', 404);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return prisma.$transaction(async (tx) => {
    const card = await tx.greetingCardImage.create({ data: { momentId, userId, mime, bytes, size: bytes.length, sha256 }, select: metadata });
    await tx.greetingCardImage.updateMany({ where: { momentId, id: { not: card.id }, retiredAt: null }, data: { retiredAt: new Date() } });
    const plans = await tx.deliveryPlan.updateMany({ where: { draft: { momentID: momentId }, channel: 'email', status: { in: editableStatuses } }, data: { cardId: card.id } });
    await removeUnreferenced(tx, momentId);
    return { card, plansUpdated: plans.count };
  });
}

/**
 * Removes the moment's card: deliveries that have not started sending go out without it, and the image
 * is deleted unless a sent or in-flight delivery still refers to it (that row is only retired).
 */
export async function deleteCardImage(userId: string, momentId: string) {
  const card = await prisma.greetingCardImage.findFirst({ where: { momentId, userId, retiredAt: null, moment: { userId } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
  if (!card) throw new MomentError('No greeting card has been saved for this moment.', 404);
  return prisma.$transaction(async (tx) => {
    const plans = await tx.deliveryPlan.updateMany({ where: { draft: { momentID: momentId }, cardId: { not: null }, status: { in: editableStatuses } }, data: { cardId: null } });
    await tx.greetingCardImage.updateMany({ where: { momentId, retiredAt: null }, data: { retiredAt: new Date() } });
    await removeUnreferenced(tx, momentId);
    return { deleted: card.id, plansUpdated: plans.count };
  });
}

function removeUnreferenced(tx: Prisma.TransactionClient, momentId: string) {
  return tx.greetingCardImage.deleteMany({ where: { momentId, retiredAt: { not: null }, plans: { none: {} } } });
}

export async function readCardImage(userId: string, momentId: string) {
  const card = await prisma.greetingCardImage.findFirst({ where: { momentId, userId, retiredAt: null, moment: { userId } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  if (!card) throw new MomentError('No greeting card has been saved for this moment.', 404);
  return card;
}

/** The latest card per moment, without its bytes, for the moments list. */
export async function cardSummaries(userId: string, momentIds: string[]) {
  const cards = momentIds.length ? await prisma.greetingCardImage.findMany({ where: { userId, momentId: { in: momentIds }, retiredAt: null }, select: { ...metadata, momentId: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }) : [];
  const latest = new Map<string, Omit<(typeof cards)[number], 'momentId'>>();
  for (const { momentId, ...card } of cards) if (!latest.has(momentId)) latest.set(momentId, card);
  return latest;
}
