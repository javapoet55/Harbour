/** Validate all dates before any task mutation, including recurrence updates. */
export function validateTaskDates(body: { startAt?: unknown; date?: unknown; time?: unknown; recurrence?: { until?: unknown } | null }) {
  for (const value of [body.startAt, body.recurrence?.until]) {
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('INVALID_TASK');
    const day = value.slice(0, 10);
    if (new Date(day).toISOString().slice(0, 10) !== day) throw new Error('INVALID_TASK');
  }
  if (body.date !== undefined && (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !Number.isFinite(Date.parse(body.date)) || new Date(body.date).toISOString().slice(0, 10) !== body.date)) throw new Error('INVALID_TASK');
  if (body.time !== undefined && (typeof body.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))) throw new Error('INVALID_TASK');
}
