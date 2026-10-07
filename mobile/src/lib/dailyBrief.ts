import type { NexdoTask } from '../api';
import type { AssistantSection } from './assistantPresentation';
import { ASK_INTENTS, type AskIntentId } from './askIntents';

/**
 * The Daily Brief (ios/App/DailyBriefView.swift) and the `BriefContent` rules it filters with
 * (ios/Sources/NexdoCore/AssistantPresentation.swift:27-43): "Legacy prose is not evidence of an
 * actionable task or a schedule conflict."
 */

const NOT_USEFUL = [
  'none detected',
  'nothing to report',
  'no tasks',
  'no open focus',
  'no matching actionable',
  'no calendar appointment',
  'no hard,',
  'no conflicts',
  'no schedule conflicts',
  "there's no overloaded",
  'the main risk is drift',
  'the main live planning focus',
  'past contact and admin tasks',
  'task calendar link(s) changed outside',
  'their current calendar blocks are protected',
];

/** `BriefContent.isUseful(_:)`. */
export function briefIsUseful(text: string): boolean {
  const value = text.toLowerCase().trim().replaceAll('’', "'");
  if (value === '') return false;
  return !NOT_USEFUL.some((phrase) => value.includes(phrase));
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `BriefContent.taskTitleMatches(_:text:)`: the line is the task's whole title, or starts with it
 * followed by a dash, a colon/comma/full stop, or " is " — after any "1." / "1)" numbering.
 */
export function briefTaskTitleMatches(title: string, text: string): boolean {
  const value = text.trim().replace(/^\d+[.)]\s*/, '');
  const name = title.trim();
  if (name === '') return false;
  if (value.toLowerCase() === name.toLowerCase()) return true;
  return new RegExp(`^${escapeRegExp(name)}(?:\\s+[—–-]\\s+|[:,.]\\s+|\\s+is\\s+)`, 'i').test(value);
}

/** `!$0.isDone && $0.status != "CANCELLED"`. */
export const isOpenTask = (task: NexdoTask) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED';

/**
 * `visibleSections` (DailyBriefView.swift:9-20): no "calendar freshness" section, only useful lines, and
 * a priorities/focus line only when it names a current open task. Empty sections go.
 */
export function visibleBriefSections(sections: AssistantSection[], tasks: NexdoTask[]): AssistantSection[] {
  return sections.flatMap((section) => {
    const title = section.title.toLowerCase();
    if (title.includes('calendar freshness')) return [];
    const priorities = title.includes('priorit') || title.includes('focus');
    const items = section.items.filter(
      (item) => briefIsUseful(item) && (!priorities || tasks.some((task) => isOpenTask(task) && briefTaskTitleMatches(task.title, item))),
    );
    return items.length === 0 ? [] : [{ title: section.title, items }];
  });
}

/** `task(for:)` (BriefSectionDetailView.swift:22-27): exactly one open task whose title leads the line. */
export function briefTask(tasks: NexdoTask[], text: string): NexdoTask | null {
  const matches = tasks.filter((task) => isOpenTask(task) && briefTaskTitleMatches(task.title, text));
  return matches.length === 1 ? matches[0] : null;
}

/** The four intents that open as a brief (`briefingIntent`, AskNexdoView.swift:194-198). */
export const BRIEFING_INTENTS: AskIntentId[] = ['dailyBriefing', 'topFocusTasks', 'deadlinesAndRisks', 'findScheduleTime'];

/** `briefingIntent`: the intent whose query was exactly the last prompt, when the turn needs no confirmation. */
export function briefingIntent(lastPrompt: string | null, hasConfirmation: boolean, shopping: boolean): AskIntentId | null {
  if (shopping || hasConfirmation || lastPrompt === null) return null;
  return ASK_INTENTS.find((intent) => BRIEFING_INTENTS.includes(intent.id) && intent.query === lastPrompt)?.id ?? null;
}

/** `screenTitle`, `subtitle` and `introduction` (DailyBriefView.swift:115-138). */
export function briefCopy(intent: AskIntentId, name: string) {
  switch (intent) {
    case 'topFocusTasks':
      return { screenTitle: 'Top 3 Tasks', subtitle: 'Here’s where to focus your effort.', introduction: `Your focus recommendations, ${name}. Prioritize what matters most.` };
    case 'deadlinesAndRisks':
      return { screenTitle: 'Due & Risks', subtitle: 'Stay ahead of deadlines and risks.', introduction: `Your deadlines and risks, ${name}. See what needs attention.` };
    case 'findScheduleTime':
      return { screenTitle: 'Find Time', subtitle: 'Find time around your plans.', introduction: `Your schedule insights, ${name}. Make room for your next move.` };
    default:
      return { screenTitle: 'daily brief', subtitle: 'Here’s what you need to know today.', introduction: `Here’s your quick briefing for today, ${name}. Focus on what matters most.` };
  }
}

export type BriefArtworkPart = 'priority' | 'calendar' | 'warning' | 'lightbulb';
export type BriefTone = 'green' | 'pink' | 'blue' | 'orange';

/** Foundation's `capitalized`: each whitespace-delimited word gets an uppercase first letter, the rest lowercase. */
export function capitalized(value: string): string {
  return value.toLowerCase().replace(/(^|\s)(\S)/g, (_, space: string, letter: string) => space + letter.toUpperCase());
}

/** `style(_:)` (DailyBriefView.swift:153-164): a section's display title, artwork and colour. */
export function briefStyle(raw: string): { title: string; artwork: BriefArtworkPart; tone: BriefTone } {
  const title = raw.toLowerCase();
  if (title === 'ai response') return { title: 'AI Response', artwork: 'lightbulb', tone: 'green' };
  if (title.includes('priorit') || title.includes('focus')) return { title: 'Top Priorities', artwork: 'priority', tone: 'pink' };
  if (title.includes('deadline')) return { title: 'Upcoming Deadlines', artwork: 'calendar', tone: 'blue' };
  if (title.includes('conflict') || title.includes('risk')) return { title: 'Conflicts & Risks', artwork: 'warning', tone: 'orange' };
  if (title.includes('next')) return { title: 'Next Move', artwork: 'lightbulb', tone: 'green' };
  if (['time', 'schedule', 'availability', 'slot'].some((word) => title.includes(word))) return { title: capitalized(title), artwork: 'calendar', tone: 'blue' };
  return { title: capitalized(title), artwork: 'lightbulb', tone: 'green' };
}

/**
 * A bullet that says there is nothing ("No deadlines appear to fall today."): shown, but not an item to count.
 * Android ahead of iOS: ported from `BriefContent.isEmptyStatement` on fix/ios-bug-pass (9f32f13).
 */
export function isEmptyBriefStatement(text: string): boolean {
  const value = text.toLowerCase().trim().replace(/’/g, "'").replace(/^\d+[.)]\s*/, '');
  return ['no ', 'none ', 'none.', 'nothing ', 'there are no ', 'there is no ', "there's no ", "there aren't any ", "there isn't any ", 'you have no ', "you don't have any ", 'you do not have any '].some(
    (prefix) => value.startsWith(prefix),
  );
}

/** What a section's badge and its page count: its items, leaving out bullets that only say there is nothing. */
export function briefItemCount(items: string[]): number {
  return items.filter((item) => !isEmptyBriefStatement(item)).length;
}

/** The detail page's subtitle and heading (BriefSectionDetailView.swift:37, :52). `count` is `briefItemCount`. */
export function briefDetailCopy(title: string, count: number) {
  const priority = title === 'Top Priorities';
  return {
    priority,
    subtitle: count === 0 ? `Nothing to ${priority ? 'focus on' : 'review'}` : `${count} ${count === 1 ? 'item' : 'items'} to ${priority ? 'focus on' : 'review'}`,
    heading: priority ? 'Focus on what matters' : `Your ${title === 'AI Response' ? 'AI response' : title.toLowerCase()}`,
  };
}

/** "Need help with this?" sends this (BriefSectionDetailView.swift:67). */
export const briefHelpQuery = (title: string, items: string[]) => `Help me with these ${title.toLowerCase()}:\n${items.join('\n')}`;
