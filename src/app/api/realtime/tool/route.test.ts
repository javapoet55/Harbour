import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), executeVoiceTool: vi.fn(), validateVoiceTool: vi.fn(), lookup: vi.fn() }));
vi.mock('@/server/auth', () => mocks);
vi.mock('@/server/shopping/food/service', () => ({ productData: { lookup: mocks.lookup } }));
vi.mock('@/server/voice/tools', () => mocks);
const request = (consent = true) => new Request('https://nexdo.test/api/realtime/tool', { method: 'POST', body: JSON.stringify({ consent, sessionId: '11111111-1111-4111-8111-111111111111', callId: 'c', name: 'create_task', arguments: {} }) });
beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: 'user' }); mocks.executeVoiceTool.mockResolvedValue({ success: true }); });
it('requires authentication', async () => { mocks.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED')); expect((await POST(request())).status).toBe(401); expect(mocks.executeVoiceTool).not.toHaveBeenCalled(); });
it('requires current voice consent', async () => { expect((await POST(request(false))).status).toBe(400); expect(mocks.executeVoiceTool).not.toHaveBeenCalled(); });
it('never reports a failed service as success or leaks diagnostics', async () => { mocks.executeVoiceTool.mockRejectedValue(new Error('private database data')); const response = await POST(request()); expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ success: false, uncertain: true }); });
it('rejects task mutations from the calendar voice flow', async () => {
  const response = await POST(new Request('https://nexdo.test/api/realtime/tool', { method: 'POST', body: JSON.stringify({ consent: true, scope: 'calendar', sessionId: '11111111-1111-4111-8111-111111111111', callId: 'c', name: 'create_task', arguments: {} }) }));
  expect(response.status).toBe(400);
  expect(mocks.executeVoiceTool).not.toHaveBeenCalled();
});

const foodRequest = (name: string, args: object = { name: 'Mango' }) => new Request('https://nexdo.test/api/realtime/tool', { method: 'POST', body: JSON.stringify({ consent: true, scope: 'food', sessionId: '11111111-1111-4111-8111-111111111111', callId: 'f', name, arguments: args }) });
it('returns sourced food facts through the existing authenticated tool endpoint', async () => {
  mocks.lookup.mockResolvedValue({ source: 'USDA', nutrition: { calories: 60 }, matchQuality: 'representative_generic' });
  const response = await POST(foodRequest('lookup_food'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, facts: { source: 'USDA', nutrition: { calories: 60 } } });
  expect(mocks.lookup).toHaveBeenCalledWith({ name: 'Mango' });
  expect(mocks.executeVoiceTool).not.toHaveBeenCalled();
});
it('rejects mutations and malformed lookups in food mode', async () => {
  expect((await POST(foodRequest('create_task'))).status).toBe(400);
  expect((await POST(foodRequest('lookup_food', { name: '', barcode: 'fake' }))).status).toBe(400);
  expect(mocks.lookup).not.toHaveBeenCalled(); expect(mocks.executeVoiceTool).not.toHaveBeenCalled();
});
it('reports missing food data and provider failures without inventing facts', async () => {
  mocks.lookup.mockResolvedValue(null);
  expect(await (await POST(foodRequest('lookup_food'))).json()).toMatchObject({ success: true, facts: null });
  mocks.lookup.mockRejectedValue(new Error('private provider credential'));
  const response = await POST(foodRequest('lookup_food'));
  const body = await response.json(); expect(body.success).toBe(false); expect(JSON.stringify(body)).not.toContain('credential');
});
