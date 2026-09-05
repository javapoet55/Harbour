export type FocusCandidate = {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueAt: Date | null;
  startAt: Date | null;
  postponeCount?: number;
  dependencyBlocked?: boolean;
  calendarConflict?: boolean;
  completionProbability?: number | null;
};

export type RankedFocus = FocusCandidate & { score: number; reasons: string[] };

export function rankFocusTasks(tasks: FocusCandidate[], now = new Date()): RankedFocus[] {
  return tasks.map((task) => {
    const reasons: string[] = [];
    let score = task.priority === 'CRITICAL' ? 500 : task.priority === 'HIGH' ? 350 : task.priority === 'NORMAL' ? 180 : 80;
    if (task.priority === 'CRITICAL' || task.priority === 'HIGH') reasons.push(`${task.priority.toLowerCase()} priority`);
    if (task.status === 'IN_PROGRESS') { score += 220; reasons.push('already in progress'); }
    if (task.dueAt) {
      const hours = (task.dueAt.getTime() - now.getTime()) / 3_600_000;
      if (hours < 0) { score += 300; reasons.push('overdue'); }
      else {
        score += Math.max(0, 200 - Math.floor(hours / 3));
        if (hours <= 24) reasons.push('due within 24 hours');
        else if (hours <= 72) reasons.push('due within three days');
        else reasons.push('upcoming deadline');
      }
    }
    if (task.calendarConflict) { score += 160; reasons.push('calendar conflict'); }
    if (task.postponeCount) { score += Math.min(120, task.postponeCount * 30); reasons.push(`postponed ${task.postponeCount} time${task.postponeCount === 1 ? '' : 's'}`); }
    if (task.completionProbability !== null && task.completionProbability !== undefined) {
      const risk = 100 - task.completionProbability;
      score += Math.round(risk * 1.2);
      if (risk >= 50) reasons.push('low predicted completion chance');
    }
    if (task.dependencyBlocked) { score -= 400; reasons.push('blocked by a dependency'); }
    return { ...task, score, reasons: reasons.length ? reasons : ['scheduled work'] };
  }).sort((a, b) => b.score - a.score || (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title));
}
