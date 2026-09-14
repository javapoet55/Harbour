import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/calendar/events/route';
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), executeVoiceTool: vi.fn(), validateVoiceTool: vi.fn() }));
vi.mock('@/server/auth', () => mocks);
vi.mock('@/server/voice/tools', () => mocks);
const event = { requestId: '11111111-1111-4111-8111-111111111111', title: 'Dentist', notes: '', location: '', startAt: '2099-01-01T18:00:00Z', endAt: '2099-01-01T18:30:00Z' };
const request = (body = event) => new Request('https://nexdo.test/api/calendar/events', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: 'owner' }); mocks.executeVoiceTool.mockResolvedValue({ success: true }); });
it('saves manual entries as calendar events with a stable request key', async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.executeVoiceTool).toHaveBeenCalledWith('owner', event.requestId, 'manual-calendar-event', 'create_calendar_event', expect.objectContaining({ title: 'Dentist' }));
});
it('rejects an end before the start without saving', async () => {
  expect((await POST(request({ ...event, endAt: event.startAt }))).status).toBe(400);
  expect(mocks.executeVoiceTool).not.toHaveBeenCalled();
});
it('requires an authenticated account', async () => {
  mocks.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await POST(request())).status).toBe(401);
  expect(mocks.executeVoiceTool).not.toHaveBeenCalled();
});
it('returns a schedule rejection and never silently supplies consent', async () => {
  mocks.executeVoiceTool.mockResolvedValue({ success: false, requiresConfirmation: true, warnings: ['Overlaps a meeting'] });
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: 'SCHEDULE_WARNING', warnings: ['Overlaps a meeting'] });
  expect(mocks.executeVoiceTool.mock.calls[0][4].allowScheduleConflict).toBeUndefined();
});
it('forwards explicit schedule consent for a retried manual event', async () => {
  await POST(new Request('https://nexdo.test/api/calendar/events', { method: 'POST', body: JSON.stringify({ ...event, allowScheduleConflict: true }) }));
  expect(mocks.executeVoiceTool.mock.calls[0][4].allowScheduleConflict).toBe(true);
});
