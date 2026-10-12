import * as fs from 'fs';
import * as path from 'path';

/**
 * Android declares WRITE_CALENDAR only because expo-calendar will not READ without it (android-polish.md
 * §39). The app must never write to the phone's calendars, as Swift never does: no source file may call
 * an expo-calendar function that creates, changes or deletes a calendar, event, reminder or attendee.
 */
const WRITES = /\b(create|update|delete)(Calendar|Event|Reminder|Attendee)Async\b|\b(createEvent|createCalendar|updateEvent|deleteEvent)\(/;

describe('the phone calendar stays read-only', () => {
  const root = path.join(__dirname, '..', '..', '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, 'src'));
  walk(path.join(root, 'app'));

  it('finds no expo-calendar write call in any file that imports expo-calendar', () => {
    const importers = files.filter((file) => /from 'expo-calendar(?:\/legacy)?'/.test(fs.readFileSync(file, 'utf8')));
    expect(importers.length).toBeGreaterThan(0);
    const writers = importers.filter((file) => WRITES.test(fs.readFileSync(file, 'utf8')));
    expect(writers.map((file) => path.relative(root, file))).toEqual([]);
  });

  /**
   * In this expo-calendar the function API on the package root is a set of stubs that throw ("…is
   * deprecated"); only `expo-calendar/legacy` reaches the native module. Parity pass 4 found every read
   * failing and access reading as denied because of it (android-polish.md §39).
   */
  it('imports the function API from expo-calendar/legacy, never the throwing root', () => {
    const root = files.filter((file) => /from 'expo-calendar'/.test(fs.readFileSync(file, 'utf8')));
    expect(root.map((file) => path.relative(path.join(__dirname, '..', '..', '..', '..'), file))).toEqual([]);
  });

  it('would catch a write', () => {
    expect(WRITES.test('await Calendar.createEventAsync(id, details)')).toBe(true);
    expect(WRITES.test('Calendar.deleteCalendarAsync(id)')).toBe(true);
    expect(WRITES.test('await Calendar.getEventsAsync(ids, start, end)')).toBe(false);
  });
});
