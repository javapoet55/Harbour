import type { NexdoTask } from '../api/types';
import { detailsBody, draftFrom, draftsEqual, isDraftValid, scheduleBody, type TaskDraft } from './taskDraft';

function task(overrides: Partial<NexdoTask> = {}): NexdoTask {
  return { id: 't1', title: 'A task', status: 'PLANNED', priority: 'MEDIUM', durationMin: 30, ...overrides };
}

/** A draft and an untouched copy of it, as the details screen holds them. */
function pair(overrides: Partial<NexdoTask> = {}): { draft: TaskDraft; original: TaskDraft } {
  return { draft: draftFrom(task(overrides)), original: draftFrom(task(overrides)) };
}

describe('draftFrom', () => {
  it('applies the Swift defaults for absent fields', () => {
    expect(draftFrom(task())).toMatchObject({
      projectId: null,
      notes: '',
      energy: 'MEDIUM',
      splittable: false,
      critical: false,
      schedule: null,
      recurrence: 'NONE',
      steps: [],
    });
  });

  it('sorts steps by sortOrder', () => {
    const draft = draftFrom(
      task({
        subtasks: [
          { id: 'b', title: 'Second', sortOrder: 1 },
          { id: 'a', title: 'First', sortOrder: 0 },
        ],
      }),
    );
    expect(draft.steps.map((step) => step.title)).toEqual(['First', 'Second']);
  });

  it('takes the schedule from startAt, not dueAt', () => {
    const draft = draftFrom(task({ startAt: '2026-09-16T03:30:00.000Z', dueAt: '2026-09-20T03:30:00.000Z' }));
    expect(draft.schedule).toBe(Date.parse('2026-09-16T03:30:00.000Z'));
  });

  it('carries only the recurrence frequency', () => {
    expect(draftFrom(task({ recurrence: { frequency: 'WEEKLY', interval: 3 } })).recurrence).toBe('WEEKLY');
  });
});

describe('isDraftValid', () => {
  it('rejects a blank title', () => {
    const { draft } = pair();
    expect(isDraftValid({ ...draft, title: '   ' })).toBe(false);
  });

  it('bounds the duration to 1–1440', () => {
    const { draft } = pair();
    expect(isDraftValid({ ...draft, duration: 0 })).toBe(false);
    expect(isDraftValid({ ...draft, duration: 1 })).toBe(true);
    expect(isDraftValid({ ...draft, duration: 1440 })).toBe(true);
    expect(isDraftValid({ ...draft, duration: 1441 })).toBe(false);
  });

  it('rejects a blank step title', () => {
    const { draft } = pair();
    expect(isDraftValid({ ...draft, steps: [{ id: 's1', title: '  ', sortOrder: 0 }] })).toBe(false);
  });

  it('caps the steps at 50', () => {
    const { draft } = pair();
    const steps = Array.from({ length: 51 }, (_, index) => ({ id: `s${index}`, title: 'Step', sortOrder: index }));
    expect(isDraftValid({ ...draft, steps })).toBe(false);
    expect(isDraftValid({ ...draft, steps: steps.slice(0, 50) })).toBe(true);
  });
});

describe('detailsBody', () => {
  it('is empty when nothing changed, so no request is made', () => {
    const { draft, original } = pair();
    expect(detailsBody(draft, original)).toEqual({});
  });

  it('sends only the changed fields', () => {
    const { draft, original } = pair();
    expect(detailsBody({ ...draft, priority: 'HIGH' }, original)).toEqual({ priority: 'HIGH' });
  });

  it('trims the title but not the notes', () => {
    const { draft, original } = pair();
    const body = detailsBody({ ...draft, title: '  Renamed  ', notes: '  keep  ' }, original);
    expect(body).toEqual({ title: 'Renamed', notes: '  keep  ' });
  });

  it('sends an explicit null to clear the project', () => {
    const original = draftFrom(task({ projectId: 'p1' }));
    const body = detailsBody({ ...original, projectId: null }, original);
    expect(body).toEqual({ projectId: null });
    expect('projectId' in body).toBe(true);
  });

  it('sends subtasks as an array of titles, because the server replaces every row', () => {
    const original = draftFrom(task({ subtasks: [{ id: 's1', title: 'Old', sortOrder: 0 }] }));
    const draft = { ...original, steps: [{ id: 's1', title: '  New  ', sortOrder: 0 }] };
    expect(detailsBody(draft, original)).toEqual({ subtasks: ['New'] });
  });

  it('clears recurrence with null and sets it with an interval of 1', () => {
    const original = draftFrom(task({ recurrence: { frequency: 'WEEKLY', interval: 1 } }));
    expect(detailsBody({ ...original, recurrence: 'NONE' }, original)).toEqual({ recurrence: null });

    const none = draftFrom(task());
    expect(detailsBody({ ...none, recurrence: 'DAILY' }, none)).toEqual({ recurrence: { frequency: 'DAILY', interval: 1 } });
  });

  it('sends booleans as booleans, including false', () => {
    const original = draftFrom(task({ critical: true, splittable: true }));
    expect(detailsBody({ ...original, critical: false, splittable: false }, original)).toEqual({ critical: false, splittable: false });
  });
});

describe('scheduleBody', () => {
  const scheduled = '2026-09-16T03:30:00.000Z';

  it('is null for a task that has never been scheduled', () => {
    const { draft, original } = pair();
    expect(scheduleBody({ ...draft, duration: 60 }, original)).toBeNull();
  });

  it('is null when the schedule, duration and critical flag are unchanged', () => {
    const { draft, original } = pair({ startAt: scheduled });
    expect(scheduleBody(draft, original)).toBeNull();
  });

  it('sends the new start and the duration when the schedule moves', () => {
    const original = draftFrom(task({ startAt: scheduled }));
    const moved = Date.parse('2026-09-17T03:30:00.000Z');
    expect(scheduleBody({ ...original, schedule: moved }, original)).toEqual({
      startAt: '2026-09-17T03:30:00.000Z',
      durationMin: 30,
    });
  });

  it('re-sends the schedule when only the duration changed, so the server revalidates the slot', () => {
    const original = draftFrom(task({ startAt: scheduled }));
    expect(scheduleBody({ ...original, duration: 90 }, original)).toEqual({ startAt: scheduled, durationMin: 90 });
  });

  it('re-sends the schedule when only the critical flag changed', () => {
    const original = draftFrom(task({ startAt: scheduled }));
    expect(scheduleBody({ ...original, critical: true }, original)).toEqual({ startAt: scheduled, durationMin: 30 });
  });
});

describe('draftsEqual', () => {
  it('is true for an untouched copy', () => {
    const { draft, original } = pair({ startAt: '2026-09-16T03:30:00.000Z', subtasks: [{ id: 's1', title: 'Step', sortOrder: 0 }] });
    expect(draftsEqual(draft, original)).toBe(true);
  });

  it('notices a step title edit', () => {
    const original = draftFrom(task({ subtasks: [{ id: 's1', title: 'Step', sortOrder: 0 }] }));
    expect(draftsEqual({ ...original, steps: [{ id: 's1', title: 'Edited', sortOrder: 0 }] }, original)).toBe(false);
  });

  it('notices a step being added or removed', () => {
    const original = draftFrom(task());
    expect(draftsEqual({ ...original, steps: [{ id: 's1', title: 'New', sortOrder: 0 }] }, original)).toBe(false);
  });
});
