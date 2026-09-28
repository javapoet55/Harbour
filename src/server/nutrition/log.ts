import { z } from 'zod';
import { prisma } from '@/server/db';
import { productData } from '@/server/shopping/food/service';
import { calculateCalories, MAX_ITEM_KCAL, type FoodLookup } from './calories';
import { MEALS } from './config';
import { NutritionError } from './errors';
import { dateRange, isLocalDate } from './time';

export const defaultLookup: FoodLookup = query => productData.lookup(query);

type Entry = NonNullable<Awaited<ReturnType<typeof prisma.foodLogEntry.findFirst>>>;
export function publicEntry(e: Entry) {
  return {
    id: e.id, date: e.localDate, meal: e.meal, description: e.description, foodName: e.foodName,
    quantity: e.quantity, unit: e.unit, grams: e.grams, kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG,
    fiberG: e.fiberG, calciumMg: e.calciumMg, ironMg: e.ironMg, vitaminDIu: e.vitaminDIu,
    source: e.source, status: e.status, reviewReason: e.reviewReason, fromCall: !!e.callId, createdAt: e.createdAt.toISOString(),
  };
}

export async function dayLog(userId: string, date: string) {
  if (!isLocalDate(date)) throw new NutritionError('INVALID_INPUT');
  const [entries, settings] = await Promise.all([
    prisma.foodLogEntry.findMany({ where: { userId, localDate: date }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    prisma.nutritionCallSettings.findUnique({ where: { userId }, select: { calorieGoal: true } }),
  ]);
  const sum = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' | 'calciumMg' | 'ironMg' | 'vitaminDIu') => Math.round(entries.reduce((t, e) => t + (e[key] ?? 0), 0) * 10) / 10;
  return {
    date, calorieGoal: settings?.calorieGoal ?? 2000,
    totals: { kcal: Math.round(sum('kcal')), proteinG: sum('proteinG'), carbsG: sum('carbsG'), fatG: sum('fatG'),
      fiberG: sum('fiberG'), calciumMg: Math.round(sum('calciumMg')), ironMg: sum('ironMg'), vitaminDIu: Math.round(sum('vitaminDIu')) },
    needsReview: entries.filter(e => e.status !== 'CONFIRMED').length,
    entries: entries.map(publicEntry),
  };
}

export const entryInput = z.object({
  date: z.string().refine(isLocalDate),
  meal: z.enum(MEALS),
  description: z.string().trim().min(1).max(200),
  foodName: z.string().trim().min(1).max(100).optional(),
  quantity: z.number().min(0).max(1000).optional(),
  unit: z.string().trim().max(30).optional(),
  grams: z.number().min(0).max(3000).optional(),
  kcal: z.number().int().min(0).max(MAX_ITEM_KCAL).optional(),
}).strict();

/** Typed entries: a user-entered calorie value is trusted as-is; otherwise it is looked up like a call item. */
export async function addEntry(userId: string, raw: unknown, lookup: FoodLookup = defaultLookup) {
  const input = entryInput.parse(raw);
  const foodName = input.foodName ?? input.description;
  if (input.kcal !== undefined) {
    const e = await prisma.foodLogEntry.create({ data: {
      userId, localDate: input.date, meal: input.meal, description: input.description, foodName,
      quantity: input.quantity ?? null, unit: input.unit ?? null, grams: input.grams ?? null, kcal: input.kcal, source: 'MANUAL', status: 'CONFIRMED',
    } });
    return publicEntry(e);
  }
  const result = await calculateCalories({ meal: input.meal, description: input.description, foodName, quantity: input.quantity, unit: input.unit, estimatedGrams: input.grams }, lookup);
  const e = await prisma.foodLogEntry.create({ data: {
    userId, localDate: input.date, meal: input.meal, description: input.description, foodName: result.foodName,
    quantity: input.quantity ?? null, unit: input.unit ?? null, grams: result.grams, kcal: result.kcal,
    proteinG: result.proteinG, carbsG: result.carbsG, fatG: result.fatG, fiberG: result.fiberG, calciumMg: result.calciumMg, ironMg: result.ironMg, vitaminDIu: result.vitaminDIu, source: result.source, sourceRef: result.sourceRef,
    status: result.needsReview ? 'NEEDS_REVIEW' : 'CONFIRMED', reviewReason: result.reviewReason,
  } });
  return publicEntry(e);
}

export const entryPatch = z.object({
  meal: z.enum(MEALS).optional(),
  description: z.string().trim().min(1).max(200).optional(),
  kcal: z.number().int().min(0).max(MAX_ITEM_KCAL).optional(),
  confirm: z.literal(true).optional(),
}).strict();

/** User edits from the food log. Editing the calorie value makes it a manual value; confirming clears the review flag. */
export async function updateEntry(userId: string, id: string, raw: unknown) {
  const patch = entryPatch.parse(raw);
  const existing = await prisma.foodLogEntry.findFirst({ where: { id, userId } });
  if (!existing) throw new NutritionError('NOT_FOUND');
  const e = await prisma.foodLogEntry.update({ where: { id }, data: {
    ...(patch.meal ? { meal: patch.meal } : {}),
    ...(patch.description ? { description: patch.description } : {}),
    ...(patch.kcal !== undefined ? { kcal: patch.kcal, source: 'MANUAL', proteinG: null, carbsG: null, fatG: null, fiberG: null, calciumMg: null, ironMg: null, vitaminDIu: null } : {}),
    ...(patch.confirm || patch.kcal !== undefined ? { status: 'CONFIRMED', reviewReason: null } : {}),
  } });
  return publicEntry(e);
}

export async function deleteEntry(userId: string, id: string) {
  const { count } = await prisma.foodLogEntry.deleteMany({ where: { id, userId } });
  if (!count) throw new NutritionError('NOT_FOUND');
  return { deleted: true };
}

/** Monday of the week containing a local date (weeks run Monday to Sunday). */
export function mondayOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}

/** Daily calorie totals: Week is the Monday–Sunday week containing the date; Month is the 30 days ending on it. */
export async function periodSummary(userId: string, endDate: string, days: 7 | 30) {
  if (!isLocalDate(endDate)) throw new NutritionError('INVALID_INPUT');
  const dates = days === 7 ? dateRange(mondayOf(endDate), -7) : dateRange(endDate, days);
  const groups = await prisma.foodLogEntry.groupBy({
    by: ['localDate'], where: { userId, localDate: { gte: dates[0], lte: dates[dates.length - 1] } }, _sum: { kcal: true },
  });
  const byDate = new Map(groups.map(g => [g.localDate, g._sum.kcal ?? 0]));
  const settings = await prisma.nutritionCallSettings.findUnique({ where: { userId }, select: { calorieGoal: true } });
  const daysOut = dates.map(date => ({ date, kcal: byDate.get(date) ?? 0 }));
  const logged = daysOut.filter(d => d.kcal > 0);
  return {
    startDate: dates[0], endDate: dates[dates.length - 1], days, calorieGoal: settings?.calorieGoal ?? 2000, daily: daysOut,
    averageKcal: logged.length ? Math.round(logged.reduce((t, d) => t + d.kcal, 0) / logged.length) : 0,
    daysLogged: logged.length,
  };
}
