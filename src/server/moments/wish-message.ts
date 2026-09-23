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

/** Mirrors NexdoCore MomentGreeting.message: leads with the recipient's greeting unless the wish already names them. */
export function greetingMessage(body: string, type: string, firstName: string) {
  const greeting = heading(type, firstName);
  if (!greeting) return body;
  if (new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(firstName.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(body)) return body;
  const opening = type === 'birthday' ? 'Happy Birthday' : type === 'anniversary' ? 'Happy Anniversary' : 'Get well soon';
  const text = body.trim();
  if (text.toLowerCase().startsWith(opening.toLowerCase())) {
    const remainder = text.slice(opening.length);
    if (!remainder || separators.includes(remainder[0])) {
      let at = 0;
      while (at < remainder.length && separators.includes(remainder[at])) at++;
      const rest = remainder.slice(at);
      return greeting + (rest ? ' ' + rest : '');
    }
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
