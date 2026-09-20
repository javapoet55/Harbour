const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const maxDays = 366;

function dayString(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDay(value: string | undefined) {
  if (!value || !isoDay.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || dayString(date) !== value ? null : date;
}

export type AdminDateRange = {
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
  days: number;
};

export function parseAdminDateRange(from: string | undefined, to: string | undefined, now = new Date()): AdminDateRange {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 14);
  const parsedFrom = parseDay(from);
  const parsedTo = parseDay(to);
  const span = parsedFrom && parsedTo ? Math.floor((+parsedTo - +parsedFrom) / 86_400_000) + 1 : 0;
  const valid = Boolean(parsedFrom && parsedTo && parsedFrom <= parsedTo && parsedTo <= today && span >= 1 && span <= maxDays);
  const fromDate = valid ? parsedFrom! : defaultFrom;
  const toDate = valid ? parsedTo! : today;
  return { from: dayString(fromDate), to: dayString(toDate), fromDate, toDate, days: Math.floor((+toDate - +fromDate) / 86_400_000) + 1 };
}

export function adminDateRangeLabel(range: Pick<AdminDateRange, 'from' | 'to' | 'days'>) {
  if (range.from === range.to) return new Date(`${range.from}T12:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${new Date(`${range.from}T12:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${new Date(`${range.to}T12:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}
