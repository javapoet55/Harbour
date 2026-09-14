/** A rejected schedule write has made no scheduling changes and can be explicitly retried. */
export class ScheduleWarning extends Error {
  constructor(public warnings: string[]) { super(warnings.join(' ')); }
}

export function requireNonoverlappingBatch(slots: Array<{ start: Date | null; durationMin: number }>, approved: unknown) {
  if (approved === true) return;
  const timed = slots.filter((slot): slot is { start: Date; durationMin: number } => slot.start !== null);
  if (timed.some((slot, i) => timed.slice(i + 1).some(other => +slot.start < +other.start + other.durationMin * 60000 && +other.start < +slot.start + slot.durationMin * 60000))) throw new ScheduleWarning(['Two or more tasks in this batch would overlap.']);
}
