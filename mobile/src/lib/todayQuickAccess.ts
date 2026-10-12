/**
 * The pure logic behind the Phase 11 Today changes: the summary line and the attention row. The
 * moment count is Run B's `todayMoments` (src/features/moments/domain.ts), read from the one Moments
 * store, as Swift's Today reads `ImportantMomentsStore`. The Shopping tile's status went with the tile
 * in Phase 12 (TodayQuickAccess.swift:3-18).
 */

// MARK: The "Your day, in focus" summary

/**
 * `TodayIntelligenceCard` (RootView.swift:1403, 1411-1413, commit e0a7bcd): the moment count is part
 * of the commitment total, and the line under it is "X Tasks · Y Appointments · Z Moments".
 */
export function commitmentCount(tasks: number, appointments: number, moments: number): number {
  return tasks + appointments + moments;
}

export function commitmentHeadline(total: number, today: boolean): string {
  return `${total} commitment${total === 1 ? '' : 's'} ${today ? 'today' : 'ahead'}`;
}

export function summaryLine(tasks: number, appointments: number, moments: number): string {
  return `${tasks} Task${tasks === 1 ? '' : 's'} · ${appointments} Appointment${appointments === 1 ? '' : 's'} · ${moments} Moment${moments === 1 ? '' : 's'}`;
}

// MARK: The attention card

/**
 * `attentionDescription` (RootView.swift:1517-1522, Phase 13): "N overdue task(s)" and "M schedule
 * check(s)", whichever are non-zero, joined by " · ". It replaced the attention row's subtitle when the
 * row moved into the intelligence card.
 */
export function attentionDescription(overdue: number, other: number): string {
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue task${overdue === 1 ? '' : 's'}`);
  if (other > 0) parts.push(`${other} schedule check${other === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
