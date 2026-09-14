/** Human-readable display for durations stored in whole minutes. */
export function durationLabel(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? `${hours} hour${hours === 1 ? '' : 's'}` : '', minutes || !hours ? `${minutes} minute${minutes === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
}
