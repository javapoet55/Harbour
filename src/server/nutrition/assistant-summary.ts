import { prisma } from '@/server/db';
import { dateRange } from './time';

const nutrients = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'calciumMg', 'ironMg', 'vitaminDIu'] as const;
/** Read-only, owner-scoped evidence for the general assistant; no raw call transcripts. */
export async function nutritionAssistantSummary(userId: string, from: string, to: string) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (!(days >= 1 && days <= 31)) throw new Error('Choose an inclusive date range of at most 31 days.');
  const [entries, settings] = await Promise.all([
    prisma.foodLogEntry.findMany({ where: { userId, localDate: { gte: from, lte: to } },
      orderBy: [{ localDate: 'asc' }, { id: 'asc' }], take: 3001,
      select: { localDate:true, status:true, kcal:true, proteinG:true, carbsG:true, fatG:true, fiberG:true, calciumMg:true, ironMg:true, vitaminDIu:true } }),
    prisma.nutritionCallSettings.findUnique({ where: { userId }, select: { timeZone:true, calorieGoal:true, goalsJson:true } }),
  ]);
  if (entries.length > 3000) throw new Error('Too many food entries. Request a smaller date range.');
  const summarize = (rows: typeof entries) => Object.fromEntries(nutrients.map(key => {
    const known = rows.filter(e => e[key] !== null);
    return [key, { total: known.length ? Math.round(known.reduce((sum,e)=>sum+(e[key] ?? 0),0)*10)/10 : null,
      knownEntries: known.length, totalEntries: rows.length }];
  }));
  let goals: Record<string,number> = {};
  try {
    const parsed: unknown = JSON.parse(settings?.goalsJson ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      goals = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string,number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0));
    }
  } catch { /* Missing/invalid goals must not turn into fabricated targets. */ }
  return { from, to, calendarDays:days, loggedDays:new Set(entries.map(e=>e.localDate)).size,
    entryCount:entries.length, needsReview:entries.filter(e=>e.status !== 'CONFIRMED').length,
    calorieGoal:settings?.calorieGoal ?? null, nutrientGoals:goals, nutritionTimeZone:settings?.timeZone ?? null,
    totals:summarize(entries), daily:dateRange(to,days).map(date=> {
      const rows=entries.filter(e=>e.localDate===date);
      return { date, logged:rows.length>0, totals:summarize(rows) };
    }),
    guidance:'Totals describe logged food, not necessarily all food eaten. Missing nutrient values and unlogged days are unknown, not zero. Review estimated entries. Compare only available nutrient data with saved goals; suggest food options, never diagnose a deficiency or recommend supplements from logs alone.' };
}
