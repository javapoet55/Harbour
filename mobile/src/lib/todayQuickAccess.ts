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

// MARK: The attention row

/**
 * The attention row's subtitle (RootView.swift:1151-1156, commit 63d9542): overdue tasks first, with
 * the other schedule checks as a suffix; with no overdue tasks, only the checks.
 */
export function attentionRowSubtitle(overdue: number, other: number): string {
  if (overdue > 0) return `${overdue} overdue task${overdue === 1 ? '' : 's'}${other > 0 ? ` · ${other} other` : ''}`;
  return `${other} schedule check${other === 1 ? '' : 's'}`;
}

/** `if overdueCount + otherCount > 0` (RootView.swift:1148). */
export function showsAttentionRow(overdue: number, other: number): boolean {
  return overdue + other > 0;
}
