import { beforeEach, expect, it, vi } from 'vitest';
import { checkCreationAvailability, requireAvailableSchedule, checkOccurrenceAvailability } from './availability';
const load = vi.hoisted(() => vi.fn());
vi.mock('./schedule-intelligence', () => ({ loadScheduleContext: load }));
const start = new Date('2099-01-04T20:00:00Z'), end = new Date('2099-01-04T20:30:00Z');
beforeEach(() => load.mockResolvedValue({
  timeZone: 'UTC', workingDays: '1,2,3,4,5', workStart: '09:00', workEnd: '17:00', bufferMinutes: 15,
  tasks: [], events: [], contextWarnings: ['Linked calendar blocks are protected.']
}));
it('permits explicitly chosen evening task and calendar times without an override', async () => {
  expect(await checkCreationAvailability('u', start, end, 'task')).toEqual([]);
  expect(await checkCreationAvailability('u', start, end, 'event')).toEqual([]);
  await expect(requireAvailableSchedule('u', start, 30, false)).resolves.toBeUndefined();
});
it('permits back-to-back series entries without buffer approval', async () => {
  expect(await checkOccurrenceAvailability('u', [{ startAt: start, endAt: end }, { startAt: end, endAt: new Date(+end + 1800000) }])).toEqual([]);
});
it('still requires approval for actual overlaps inside a series', async () => {
  expect(await checkOccurrenceAvailability('u', [{ startAt: start, endAt: end }, { startAt: new Date(+start + 60000), endAt: end }])).toHaveLength(1);
});
