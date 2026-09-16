import type { AssistantTurn } from '../api';
import { displaySections, spokenText } from './assistantPresentation';

function turn(visual: Partial<AssistantTurn['visual']> & { summary: string }, spoken = ''): AssistantTurn {
  return { spoken, visual: { ...visual }, contextActionId: null, confirmation: null, executive: null };
}

/** `AssistantTurn.displaySections` (ios/Sources/NexdoCore/AssistantPresentation.swift:6-24). */
describe('displaySections', () => {
  it('passes `visual.sections` through in order when the server supplies them', () => {
    const sections = displaySections(
      turn({ summary: 'Here is your day', sections: [{ title: 'Today', items: ['a', 'b'] }, { title: 'Later', items: ['c'] }] }),
    );
    expect(sections).toEqual([{ title: 'Today', items: ['a', 'b'] }, { title: 'Later', items: ['c'] }]);
  });

  it('relabels a "Next step" section as "AI Response", ignoring case and padding', () => {
    expect(displaySections(turn({ summary: 's', sections: [{ title: '  Next Step ', items: ['x'] }] }))).toEqual([
      { title: 'AI Response', items: ['x'] },
    ]);
  });

  it('falls back to the flat fields in Swift’s order: appointments, tasks, overdue, next', () => {
    expect(
      displaySections(turn({ summary: 's', appointments: ['Standup'], tasks: ['Pack'], overdue: ['Ship'], next: 'Start packing' })),
    ).toEqual([
      { title: 'Calendar appointments', items: ['Standup'] },
      { title: 'Tasks', items: ['Pack'] },
      { title: 'Overdue', items: ['Ship'] },
      { title: 'AI Response', items: ['Start packing'] },
    ]);
  });

  it('skips empty groups', () => {
    expect(displaySections(turn({ summary: 's', appointments: [], tasks: ['Pack'], overdue: null, next: '   ' }))).toEqual([
      { title: 'Tasks', items: ['Pack'] },
    ]);
  });

  it('preserves an answer that arrives only as a summary', () => {
    expect(displaySections(turn({ summary: 'Only a summary' }))).toEqual([{ title: 'AI Response', items: ['Only a summary'] }]);
  });

  it('falls back to `spoken` when the summary is blank', () => {
    expect(displaySections(turn({ summary: '   ' }, 'Spoken only'))).toEqual([{ title: 'AI Response', items: ['Spoken only'] }]);
  });

  it('produces nothing at all when there is no text anywhere', () => {
    expect(displaySections(turn({ summary: '' }, ''))).toEqual([]);
  });

  it('prefers a non-empty `sections` array over the flat fields', () => {
    expect(displaySections(turn({ summary: 's', sections: [], tasks: ['Pack'] }))).toEqual([{ title: 'Tasks', items: ['Pack'] }]);
  });
});

/** The text Read Loud speaks when no single section was chosen (AskNexdoView.swift:422). */
describe('spokenText', () => {
  it('joins every item of every section with a blank line', () => {
    expect(spokenText(turn({ summary: 's', sections: [{ title: 'A', items: ['one', 'two'] }, { title: 'B', items: ['three'] }] }))).toBe(
      'one\n\ntwo\n\nthree',
    );
  });
});
