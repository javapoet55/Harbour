import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { categoryFor } from '@/server/shopping/domain';
import { NutritionError } from './errors';
import { dateRange, isLocalDate, localDateIn } from './time';

/**
 * One factual observation a day, with at most one action. Insights only ever suggest *adding* foods toward
 * the user's own goals — never cutting calories, never "good" or "bad" foods — and users can turn them off.
 */
export type InsightNutrient = 'protein' | 'fiber' | 'calcium' | 'iron' | 'vitaminD';
type Field = 'proteinG' | 'fiberG' | 'calciumMg' | 'ironMg' | 'vitaminDIu';
const NUTRIENTS: { key: InsightNutrient; field: Field; label: string; goalKey: string; unit: string; defaultGoal: number; foods: string[] }[] = [
  { key: 'protein', field: 'proteinG', label: 'Protein', goalKey: 'Protein', unit: 'g', defaultGoal: 150, foods: ['Greek yogurt', 'Eggs', 'Lentils'] },
  { key: 'fiber', field: 'fiberG', label: 'Fiber', goalKey: 'Fiber', unit: 'g', defaultGoal: 25, foods: ['Oats', 'Black beans', 'Berries'] },
  { key: 'calcium', field: 'calciumMg', label: 'Calcium', goalKey: 'Calcium', unit: 'mg', defaultGoal: 1000, foods: ['Milk', 'Plain yogurt', 'Tofu'] },
  { key: 'iron', field: 'ironMg', label: 'Iron', goalKey: 'Iron', unit: 'mg', defaultGoal: 18, foods: ['Spinach', 'Lentils', 'Fortified cereal'] },
  { key: 'vitaminD', field: 'vitaminDIu', label: 'Vitamin D', goalKey: 'Vitamin D', unit: 'IU', defaultGoal: 800, foods: ['Fortified milk', 'Eggs', 'Salmon'] },
];
export const INSIGHT_RULES = { windowDays: 7, minLoggedDays: 3, lowShare: 0.6, minLowDays: 3, coverage: 0.7 } as const;

export type Insight = {
  key: string; kind: 'GAP' | 'STREAK' | 'NEED_DATA'; title: string; text: string;
  nutrient: InsightNutrient | null; items: string[]; listTitle: string | null; state: 'open' | 'added' | 'dismissed';
};

type Entry = { localDate: string; meal: string; kcal: number } & Record<Field, number | null>;

/** Pure: pick the day's insight from up to 7 days of entries ending on `date`. Exported for tests. */
export function chooseInsight(date: string, entries: Entry[], goals: Record<string, number>, onList: Set<string>): Omit<Insight, 'state' | 'listTitle'> | null {
  const days = dateRange(date, INSIGHT_RULES.windowDays);
  const byDay = new Map(days.map(d => [d, entries.filter(e => e.localDate === d)]));
  const logged = days.filter(d => (byDay.get(d)?.length ?? 0) > 0);
  if (logged.length === 0) return null;
  if (logged.length < INSIGHT_RULES.minLoggedDays) {
    const left = INSIGHT_RULES.minLoggedDays - logged.length;
    return { key: `${date}:need-data`, kind: 'NEED_DATA', title: 'Insights are warming up', text: `Log ${left} more day${left === 1 ? '' : 's'} this week to unlock your daily insight.`, nutrient: null, items: [] };
  }
  const candidates = [];
  for (const n of NUTRIENTS) {
    const goal = goals[n.goalKey] ?? n.defaultGoal;
    if (!(goal > 0)) continue;
    const threshold = goal * INSIGHT_RULES.lowShare;
    // A day only counts when most of its calories come from foods whose value for this nutrient is known,
    // so missing data never shows up as a shortfall.
    const eligible = logged.filter(d => {
      const list = byDay.get(d)!; const kcal = list.reduce((t, e) => t + e.kcal, 0);
      const known = list.filter(e => e[n.field] !== null).reduce((t, e) => t + e.kcal, 0);
      return kcal > 0 && known / kcal >= INSIGHT_RULES.coverage;
    });
    if (eligible.length < INSIGHT_RULES.minLoggedDays) continue;
    const low = eligible.filter(d => byDay.get(d)!.reduce((t, e) => t + (e[n.field] ?? 0), 0) < threshold);
    if (low.length < INSIGHT_RULES.minLowDays || low.length / eligible.length < 0.5) continue;
    const shortfall = low.reduce((t, d) => t + (1 - byDay.get(d)!.reduce((s, e) => s + (e[n.field] ?? 0), 0) / goal), 0) / low.length;
    const noBreakfast = low.filter(d => !byDay.get(d)!.some(e => e.meal === 'BREAKFAST')).length;
    candidates.push({ n, goal, threshold, low: low.length, eligible: eligible.length, shortfall, breakfast: noBreakfast >= Math.ceil(low.length * 2 / 3) });
  }
  candidates.sort((a, b) => b.shortfall - a.shortfall);
  const top = candidates[0];
  if (top) {
    const items = top.n.foods.filter(f => !onList.has(f.toLowerCase()));
    const amount = `${Math.round(top.threshold).toLocaleString('en-US')} ${top.n.unit}`;
    const pattern = `${top.n.label} was under ${amount} on ${top.low} of your last ${top.eligible} logged days${top.breakfast ? ', mostly on days without breakfast' : ''}.`;
    return {
      key: `${date}:${top.n.key}`, kind: 'GAP', title: `${top.n.label} is running low this week`,
      text: items.length ? `${pattern} Add ${joinList(items)} to your shopping list?` : `${pattern} ${joinList(top.n.foods)} are already on your shopping list.`,
      nutrient: top.n.key, items,
    };
  }
  let streak = 0;
  for (let i = days.length - 1; i >= 0 && (byDay.get(days[i])?.length ?? 0) > 0; i--) streak++;
  return { key: `${date}:streak`, kind: 'STREAK', title: 'Nicely consistent', text: streak >= 2 ? `You’ve logged ${streak} days in a row and stayed close to your nutrient goals.` : `You logged ${logged.length} of the last 7 days and stayed close to your nutrient goals.`, nutrient: null, items: [] };
}
const joinList = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** The open shopping list suggestions go to: the soonest upcoming unfinished list, else the latest unfinished one. */
async function targetList(userId: string, today: string) {
  const open = await prisma.shoppingList.findMany({ where: { userId, completedAt: null }, include: { items: { select: { name: true } } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
  return open.find(l => l.date >= today) ?? open[open.length - 1] ?? null;
}

export async function dailyInsight(userId: string, date: string): Promise<Insight | null> {
  if (!isLocalDate(date)) throw new NutritionError('INVALID_INPUT');
  const settings = await prisma.nutritionCallSettings.findUnique({ where: { userId } });
  if (settings && !settings.insightsEnabled) return null;
  const days = dateRange(date, INSIGHT_RULES.windowDays);
  const entries = await prisma.foodLogEntry.findMany({
    where: { userId, localDate: { gte: days[0], lte: date } },
    select: { localDate: true, meal: true, kcal: true, proteinG: true, fiberG: true, calciumMg: true, ironMg: true, vitaminDIu: true },
  });
  const goals = settings?.goalsJson ? JSON.parse(settings.goalsJson) as Record<string, number> : {};
  const list = await targetList(userId, date);
  const chosen = chooseInsight(date, entries, goals, new Set((list?.items ?? []).map(i => i.name.trim().toLowerCase())));
  if (!chosen) return null;
  const handled = settings?.insightHandledKey === chosen.key ? settings.insightHandledAction : null;
  return { ...chosen, listTitle: chosen.items.length ? (list?.title ?? 'Groceries') : null, state: handled === 'ADDED' ? 'added' : handled === 'DISMISSED' ? 'dismissed' : 'open' };
}

/** "Add to shopping list" or "Not now". The key must match today's insight, so stale or forged keys do nothing. */
export async function handleInsight(userId: string, date: string, key: unknown, action: unknown) {
  if (action !== 'add' && action !== 'dismiss') throw new NutritionError('INVALID_INPUT');
  const insight = await dailyInsight(userId, date);
  if (!insight || insight.key !== key) throw new NutritionError('NOT_FOUND');
  const tz = (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } })).timeZone;
  const record = (a: 'ADDED' | 'DISMISSED') => prisma.nutritionCallSettings.upsert({
    where: { userId }, create: { userId, timeZone: tz, insightHandledKey: insight.key, insightHandledAction: a }, update: { insightHandledKey: insight.key, insightHandledAction: a },
  });
  if (action === 'dismiss') { await record('DISMISSED'); return { ok: true, added: [] as string[], listTitle: null }; }
  if (!insight.items.length || insight.state !== 'open') return { ok: true, added: [] as string[], listTitle: insight.listTitle };
  // Never target or create a list in the past: the anchor is the later of the insight's date and today.
  const today = localDateIn(tz);
  const listDate = date > today ? date : today;
  const added = await prisma.$transaction(async tx => {
    let list = await tx.shoppingList.findFirst({ where: { userId, completedAt: null, date: { gte: listDate } }, include: { items: true }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] })
      ?? await tx.shoppingList.findFirst({ where: { userId, completedAt: null }, include: { items: true }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    if (!list) list = await tx.shoppingList.create({ data: { id: randomUUID(), userId, title: 'Groceries', date: listDate, timeZone: tz }, include: { items: true } });
    const have = new Set(list.items.map(i => i.name.trim().toLowerCase()));
    const names = insight.items.filter(n => !have.has(n.toLowerCase()));
    let order = list.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
    for (const name of names) await tx.shoppingItem.create({ data: { id: randomUUID(), listId: list.id, name, category: categoryFor(name), notes: 'Suggested by NexDo', sortOrder: ++order } });
    // Bump the revision so another device holding the old list refreshes instead of overwriting these items.
    await tx.shoppingList.update({ where: { id: list.id }, data: { revision: { increment: 1 } } });
    return { names, title: list.title };
  });
  await record('ADDED');
  return { ok: true, added: added.names, listTitle: added.title };
}
