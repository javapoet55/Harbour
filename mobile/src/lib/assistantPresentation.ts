import type { AssistantTurn } from '../api';

/**
 * `AssistantTurn.displaySections` (ios/Sources/NexdoCore/AssistantPresentation.swift:6-24).
 *
 * The server may answer in either of two shapes — a `visual.sections` array, or the older flat
 * `appointments` / `tasks` / `overdue` / `next` fields. This collapses both into the one list
 * `AskResponseView` renders, in Swift's order, and never synthesises counts or text of its own.
 */
export type AssistantSection = { title: string; items: string[] };

export function displaySections(turn: AssistantTurn): AssistantSection[] {
  const supplied = turn.visual.sections;
  if (supplied && supplied.length > 0) {
    // "Next step" is relabelled; every other title is passed through untouched.
    return supplied.map((section) => ({
      title: section.title.trim().toLowerCase() === 'next step' ? 'AI Response' : section.title,
      items: section.items,
    }));
  }

  const sections: AssistantSection[] = [];
  const appointments = turn.visual.appointments ?? [];
  const tasks = turn.visual.tasks ?? [];
  const overdue = turn.visual.overdue ?? [];
  if (appointments.length > 0) sections.push({ title: 'Calendar appointments', items: appointments });
  if (tasks.length > 0) sections.push({ title: 'Tasks', items: tasks });
  if (overdue.length > 0) sections.push({ title: 'Overdue', items: overdue });
  const next = turn.visual.next ?? '';
  if (next.trim().length > 0) sections.push({ title: 'AI Response', items: [next] });

  // "The summary is no longer a separate introduction. Preserve answers from servers that supply only
  // a summary or spoken text." (AssistantPresentation.swift:17-22)
  if (sections.length === 0) {
    const answer = turn.visual.summary.trim().length === 0 ? turn.spoken : turn.visual.summary;
    if (answer.length > 0) sections.push({ title: 'AI Response', items: [answer] });
  }
  return sections;
}

/** The text `speakAnswer()` reads when no single section was chosen (AskNexdoView.swift:422). */
export function spokenText(turn: AssistantTurn): string {
  return displaySections(turn)
    .flatMap((section) => section.items)
    .join('\n\n');
}
