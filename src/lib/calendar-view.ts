import type { AgendaPayload, AgendaTask } from './types';
import { addDays, parseYmd, ymd, startOfLocalDay } from './time';

export const shiftDay = (day: string, amount: number) => ymd(addDays(parseYmd(day), amount));
export function weekStart(day: string) { return shiftDay(day, -((parseYmd(day).getUTCDay() + 6) % 7)); }
export function monthDays(day: string) {
  const first = `${day.slice(0, 7)}-01`;
  const start = shiftDay(first, -parseYmd(first).getUTCDay());
  const d = parseYmd(first);
  const lastDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const length = Math.ceil((d.getUTCDay() + lastDate) / 7) * 7;
  return Array.from({ length }, (_, i) => shiftDay(start, i));
}
export function shiftMonth(day: string, amount: number) { const d = parseYmd(day); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + amount, 1))); }
export const localDay = (iso: string, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
export type CalendarItem = { id: string; title: string; at: string; duration: number; kind: 'task' | 'event'; critical: boolean; overdue: boolean; deadline: boolean; deadlineOnly?: boolean; allDay?: boolean; task?: AgendaTask; endAt?: string; originalStart?: string };
export function itemsOnDay(data: AgendaPayload, day: string, today: string): CalendarItem[] {
  const start = startOfLocalDay(day, data.timeZone).getTime();
  const end = startOfLocalDay(shiftDay(day, 1), data.timeZone).getTime();
  const events: CalendarItem[] = data.events.filter((e) => Date.parse(e.startAt) < end && Date.parse(e.endAt) > start).map((e) => ({ id: `event-${e.id}`, title: e.title, at: new Date(Math.max(start, Date.parse(e.startAt))).toISOString(), originalStart: e.startAt, endAt: e.endAt, duration: Math.max(0, Math.round((Math.min(end, Date.parse(e.endAt)) - Math.max(start, Date.parse(e.startAt))) / 60000)), kind: 'event', critical: false, overdue: false, deadline: false, allDay: e.allDay }));
  const tasks: CalendarItem[] = [];
  for (const t of data.tasks) {
    if (['COMPLETED', 'CANCELLED'].includes(t.status)) continue;
    const scheduled = Boolean(t.startAt && localDay(t.startAt, data.timeZone) === day);
    const deadline = Boolean(t.dueAt && localDay(t.dueAt, data.timeZone) === day);
    if (!scheduled && !deadline) continue;
    const deadlineOnly = Boolean(deadline && t.startAt && !scheduled);
    tasks.push({ id: `task-${t.id}${deadlineOnly ? '-deadline' : ''}`, title: t.title, at: scheduled ? t.startAt! : t.dueAt!, duration: deadlineOnly ? 0 : t.durationMin, kind: 'task', critical: Boolean(t.critical || t.priority === 'CRITICAL'), overdue: Boolean(t.dueAt && localDay(t.dueAt, data.timeZone) < today), deadline, deadlineOnly, task: t });
  }
  return [...events, ...tasks].sort((a, b) => Number(Boolean(b.allDay)) - Number(Boolean(a.allDay)) || a.at.localeCompare(b.at) || a.title.localeCompare(b.title));
}
