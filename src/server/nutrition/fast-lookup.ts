import { after } from 'next/server';
import { prisma } from '@/server/db';
import { PENDING, type CalorieResult } from './calories';
export { caloriesWithinBudget, lookupBudgetMs, PENDING } from './calories';

/** Late database results for items saved with an estimate because the lookup ran past its budget. */
// Entries whose late result may still be applied. A correction or removal on the call cancels it.
const tokens = new Map<string, symbol>();
const running = new Set<Promise<unknown>>();
export const cancelLateLookup = (entryId: string) => { tokens.delete(entryId); };

function runLater(job: () => Promise<unknown>) {
  const tracked = () => {
    const promise = job().catch(() => undefined).finally(() => running.delete(promise));
    running.add(promise);
    return promise;
  };
  try { after(async () => { await tracked(); }); } catch { void tracked(); } // outside a request (tests, scripts)
}

/** Replace the estimate with the database result once it arrives, unless the item was changed meanwhile. */
export function applyLateLookup(entryId: string, late: Promise<CalorieResult>) {
  const token = Symbol(entryId);
  tokens.set(entryId, token);
  runLater(async () => {
    const r = await late;
    if (tokens.get(entryId) !== token) return;
    tokens.delete(entryId);
    const current = await prisma.foodLogEntry.findUnique({ where: { id: entryId } });
    if (!current || current.source === 'MANUAL') return; // removed, or the user typed their own value
    const reviewReason = current.reviewReason === PENDING ? r.reviewReason : current.reviewReason;
    if (r.source === 'ESTIMATE') {
      await prisma.foodLogEntry.update({ where: { id: entryId }, data: { status: 'NEEDS_REVIEW', reviewReason: r.reviewReason } });
      return;
    }
    await prisma.foodLogEntry.update({ where: { id: entryId }, data: {
      foodName: r.foodName, grams: r.grams, kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG,
      source: r.source, sourceRef: r.sourceRef, reviewReason, ...(r.needsReview ? { status: 'NEEDS_REVIEW' } : {}),
    } });
  });
}

/** Test helper: wait for late lookups started outside a request. */
export async function settleLateLookups() { while (running.size) await Promise.all([...running]); }
