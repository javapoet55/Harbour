/** Port of `FocusClock` (ios/Sources/NexdoCore/FocusClock.swift). */

/** `remainingSeconds(until:now:)`: never negative, rounded UP to the next whole second. */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** `label(seconds:)`: `%02d:%02d`, so 65 seconds reads "01:05" and 3700 reads "61:40". */
export function focusLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** The strip's accessibility label (FocusSessionStrip.swift:38). */
export function focusAccessibilityLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)} minutes, ${seconds % 60} seconds remaining`;
}

/**
 * Port of `DurationDisplay.durationLabel` (ios/Sources/NexdoCore/DoNowRecommendation.swift:52-61).
 *
 * Zero reads "0 minutes", because the minutes part is always emitted when there are no hours.
 */
export function durationLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  return parts.join(' ');
}
