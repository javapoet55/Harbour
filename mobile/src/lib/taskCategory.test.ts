import { resolveCategory } from './taskCategory';

/** Port of `TaskCategoryAppearance.resolve` (ios/Sources/NexdoCore/TaskCategoryAppearance.swift). */
describe('resolveCategory', () => {
  it.each([
    ['Book the dentist', 'dental'],
    ['Finish homework', 'school'],
    ['Pay the rent', 'finance'],
    ['Morning gym session', 'fitness'],
    ['Doctor appointment', 'health'],
    ['Buy milk', 'shopping'],
    ['Cook dinner', 'food'],
    ['Renew passport', 'travel'],
    ['Client meeting', 'work'],
    ['Do the laundry', 'home'],
    ['Amma birthday', 'social'],
  ])('infers %s as %s', (title, kind) => {
    expect(resolveCategory(title).kind).toBe(kind);
  });

  it('falls back to general with the label "Tasks"', () => {
    expect(resolveCategory('Xyzzy')).toEqual({ kind: 'general', label: 'Tasks' });
  });

  it('matches whole tokens, not substrings', () => {
    // "buyer" contains "buy" but is not the token "buy".
    expect(resolveCategory('Email the buyer').kind).toBe('work');
    // "classic" contains "class".
    expect(resolveCategory('Watch a classic').kind).toBe('general');
  });

  it('requires the whole phrase for a multi-word keyword', () => {
    expect(resolveCategory('Go for a run').kind).toBe('fitness');
    // "run" alone is not a fitness keyword.
    expect(resolveCategory('Run the numbers').kind).toBe('general');
  });

  it('ignores case and diacritics', () => {
    expect(resolveCategory('RÉSERVATION at the restaurant').kind).toBe('food');
  });

  it('applies the rules in Swift order, so the earlier rule wins', () => {
    // "study" (school) is checked before "call" (work).
    expect(resolveCategory('Call about the study').kind).toBe('school');
    // "tax" (finance) is checked before "gym" (fitness).
    expect(resolveCategory('Gym tax receipt').kind).toBe('finance');
  });

  it('infers from the title before the server category name', () => {
    expect(resolveCategory('Dentist', 'Work').kind).toBe('dental');
  });

  it('falls back to the category name for the kind when the title says nothing', () => {
    expect(resolveCategory('Xyzzy', 'Travel').kind).toBe('travel');
  });

  it('prefers the server name for the LABEL even when the kind came from the title', () => {
    // The ramp is work, but the badge reads "Errands".
    expect(resolveCategory('Client meeting', 'Errands')).toEqual({ kind: 'work', label: 'Errands' });
  });

  it('treats a blank category name as absent', () => {
    expect(resolveCategory('Xyzzy', '   ')).toEqual({ kind: 'general', label: 'Tasks' });
  });

  it('gives fitness and health the same label, as defaultLabel does', () => {
    expect(resolveCategory('Gym').label).toBe('Health');
    expect(resolveCategory('Doctor').label).toBe('Health');
  });
});
