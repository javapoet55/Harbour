import {
  canAddCheck,
  canSavePreparation,
  DEFAULT_CHECKLIST,
  followUpDraft,
  makeOutcome,
  makePreparation,
  outcomeDate,
  outcomeLabel,
  preparationAfterLoad,
  recordOutcome,
  type FollowUpPreparation,
} from './model';

let counter = 0;
const newId = () => `id-${++counter}`;
beforeEach(() => {
  counter = 0;
});

describe('follow-up preparation (FollowUpPreparation.swift)', () => {
  it('starts with the four steps and a draft built from the purpose', () => {
    const value = makePreparation({ company: 'Acme Insurance', purpose: 'Claim status', notes: 'Reference 123' }, newId);
    expect(value.checklist.map((check) => check.title)).toEqual([...DEFAULT_CHECKLIST]);
    expect(value.checklist.every((check) => !check.done)).toBe(true);
    expect(new Set(value.checklist.map((check) => check.id)).size).toBe(4);
    expect(value.draft).toBe('Hello,\n\nI’m following up regarding Claim status. Could you please share an update and the next steps?\n\nThank you.');
    expect(value).toMatchObject({ phone: '', email: '', outcomes: [], notes: 'Reference 123' });
  });

  it('drops the "regarding" clause when there is no purpose', () => {
    expect(followUpDraft('')).toBe('Hello,\n\nI’m following up. Could you please share an update and the next steps?\n\nThank you.');
  });

  it('dates an outcome the way ISO8601DateFormatter does: UTC, whole seconds', () => {
    expect(outcomeDate(Date.parse('2026-10-09T16:00:00.789Z'))).toBe('2026-10-09T16:00:00Z');
    expect(makeOutcome('noAnswer', 'Voicemail', Date.parse('2026-10-09T16:00:00Z'), newId)).toEqual({ id: 'id-1', date: '2026-10-09T16:00:00Z', result: 'noAnswer', notes: 'Voicemail' });
  });

  it('records an outcome once, so a retried save does not append a second copy', () => {
    const value = makePreparation({ company: 'Acme', purpose: 'Claim', notes: '' }, newId);
    const first = recordOutcome(value, null, { result: 'unresolved', notes: 'Waiting for adjuster' }, 0, newId);
    expect(first.preparation.outcomes).toHaveLength(1);
    const retry = recordOutcome(first.preparation, first.recordedId, { result: 'unresolved', notes: 'Waiting for adjuster' }, 1000, newId);
    expect(retry.preparation.outcomes).toEqual(first.preparation.outcomes);
    expect(retry.recordedId).toBe(first.recordedId);
  });

  it('needs a company and a purpose that are not blank, like the server after its trim', () => {
    const value = makePreparation({ company: 'Acme', purpose: 'Claim', notes: '' }, newId);
    expect(canSavePreparation(value)).toBe(true);
    expect(canSavePreparation({ ...value, company: '   ' })).toBe(false);
    expect(canSavePreparation({ ...value, purpose: '\n' })).toBe(false);
  });

  it('adds a step only when it has text and the list is under 30', () => {
    const value = makePreparation({ company: 'Acme', purpose: 'Claim', notes: '' }, newId);
    expect(canAddCheck(value, '  ')).toBe(false);
    expect(canAddCheck(value, 'Bring the policy')).toBe(true);
    const full: FollowUpPreparation = { ...value, checklist: Array.from({ length: 30 }, (_, index) => ({ id: `c${index}`, title: 't', done: false })) };
    expect(canAddCheck(full, 'One more')).toBe(false);
  });

  it('fills the contact from the Action screen only when nothing is saved', () => {
    const local = makePreparation({ company: 'my insurance company', purpose: '', notes: '' }, newId);
    const recipient = { name: 'Acme Insurance', phone: '9255550100', email: 'claims@acme.example' };
    expect(preparationAfterLoad({ revision: 0, preparation: null }, local, recipient)).toMatchObject({ company: 'Acme Insurance', phone: '9255550100', email: 'claims@acme.example' });
    expect(preparationAfterLoad({ revision: 0, preparation: null }, local, null)).toBe(local);
    const saved = { ...local, company: 'Saved Co' };
    expect(preparationAfterLoad({ revision: 3, preparation: saved }, local, recipient)).toBe(saved);
  });

  it('labels the history like Swift', () => {
    expect(['resolved', 'unresolved', 'noAnswer'].map((result) => outcomeLabel(result as never))).toEqual(['Resolved', 'Unresolved', 'No answer']);
  });
});
