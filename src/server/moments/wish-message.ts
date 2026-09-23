import type { Prisma } from '@/generated/prisma';
import { editableStatuses } from './domain';

// The wish a managed moment's saved settings say to send, resolved the way the app shows it in the
// schedule review (ManageFestivalModel.deliveryMessage): the recipient's own message first, then the
// shared message with the recipient's greeting. Null when no approved message is saved.

export type SavedWishSettings = { baseMessage?: unknown; overrides?: unknown; approvedAt?: unknown };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const separators = '!. \n';

function heading(type: string, firstName: string) {
  const name = firstName.trim();
  if (!name) return null;
  return type === 'birthday' ? `Happy Birthday, ${name}!` : type === 'anniversary' ? `Happy Anniversary, ${name}!` : type === 'getWellSoon' ? `Get well soon, ${name}!` : null;
}

/**
 * Every opening the product itself writes, longest first so one can never shadow another. `fallback`
 * (./domain.ts) produces all four: "Happy Birthday" and "Happy Anniversary", "Get well soon" for
 * getWellSoon, and "Best wishes" for a festival or custom wish. A festival draft opens with the
 * festival's own title instead (service.ts generateDraft), which is free text and cannot be listed.
 */
const openings = ['Happy Anniversary', 'Happy Birthday', 'Get well soon', 'Best wishes'];

/**
 * The opening `text` already starts with, in its canonical spelling, or null. The match ignores case,
 * and the opening has to end the word: "Happy Birthdays all round" is prose, not a greeting.
 */
function openingOf(text: string) {
  const lower = text.toLowerCase();
  return openings.find((opening) => lower.startsWith(opening.toLowerCase()) && (text.length === opening.length || separators.includes(text[opening.length]))) ?? null;
}

/**
 * Mirrors NexdoCore MomentGreeting.message: leads with the recipient's greeting unless the wish
 * already names them.
 *
 * A wish that already opens with a greeting keeps that greeting and has the name put into it, rather
 * than collecting a second one — an anniversary wish saved on a moment typed as a birthday used to
 * go out as "Happy Birthday, Visakan! Happy anniversary! …". The opening the message actually uses
 * wins over the moment's type, so the text the person wrote decides the occasion.
 */
export function greetingMessage(body: string, type: string, firstName: string) {
  const greeting = heading(type, firstName);
  // No name, or an occasion with no greeting of its own (festival, custom): the wish goes as written.
  if (!greeting) return body;
  if (new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(firstName.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(body)) return body;
  const text = body.trim();
  const opening = openingOf(text);
  if (opening) {
    let at = opening.length;
    while (at < text.length && separators.includes(text[at])) at++;
    const rest = text.slice(at);
    return `${opening}, ${firstName.trim()}!` + (rest ? ' ' + rest : '');
  }
  return `${greeting} ${text}`;
}

export function savedWishMessage(settings: SavedWishSettings, recipient: { key: string; type: string; firstName: string }) {
  if (typeof settings.approvedAt !== 'string' || !settings.approvedAt) return null;
  const override = settings.overrides && typeof settings.overrides === 'object' ? (settings.overrides as Record<string, unknown>)[recipient.key] : undefined;
  if (typeof override === 'string' && override.trim()) return override;
  if (typeof settings.baseMessage === 'string' && settings.baseMessage.trim()) return greetingMessage(settings.baseMessage, recipient.type, recipient.firstName);
  return null;
}

/**
 * Points the moment's deliveries that have not started sending, and their drafts, at the new wish text,
 * the way saving the card again repoints cardId. A delivery already being sent keeps its text.
 */
export async function repointWishText(tx: Prisma.TransactionClient, momentId: string, body: string) {
  const where = { draft: { momentID: momentId }, status: { in: editableStatuses } };
  const plans = await tx.deliveryPlan.findMany({ where, select: { draftID: true } });
  if (!plans.length) return 0;
  await tx.wishDraft.updateMany({ where: { id: { in: [...new Set(plans.map((plan) => plan.draftID))] } }, data: { body } });
  return (await tx.deliveryPlan.updateMany({ where, data: { body } })).count;
}
