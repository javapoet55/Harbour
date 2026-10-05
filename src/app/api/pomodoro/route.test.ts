import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ save: vi.fn(), page: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'pomodoro-owner' })) }));
vi.mock('@/server/pomodoro/sessions', () => ({ listPomodoroPage: mocks.page, savePomodoro: mocks.save }));

import { GET, PUT } from './route';

const session = {
  id: '4f9d2e2e-0b54-4f7e-9a3b-2d5f1a8c0e11', revision: 1, category: 'focus', name: 'Proposal',
  durationMinutes: 25, autoBreak: true, playSound: false, keepAwake: true, phase: 'focus', paused: false,
  deadline: 1790001500, focusSeconds: 0, breakSeconds: 0, startedAt: 1790000000, updatedAt: 1790000000,
};

describe('pomodoro API', () => {
  beforeEach(() => { mocks.save.mockReset(); mocks.page.mockReset(); mocks.page.mockResolvedValue({ sessions: [], nextCursor: null }); });
  it('rejects malformed payloads as 400 before checking ownership', async () => {
    for (const body of ['5', '"x"', 'null', '[1]']) {
      const response = await PUT(new Request('http://localhost/api/pomodoro', { method: 'PUT', body }));
      expect(response.status).toBe(400);
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('rejects a different account owner with 403 and saves a matching owner', async () => {
    const foreign = await PUT(new Request('http://localhost/api/pomodoro', { method: 'PUT', body: JSON.stringify({ ownerID: 'someone-else', session }) }));
    expect(foreign.status).toBe(403);
    mocks.save.mockResolvedValue(session);
    const saved = await PUT(new Request('http://localhost/api/pomodoro', { method: 'PUT', body: JSON.stringify({ ownerID: 'pomodoro-owner', session }) }));
    expect(saved.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith('pomodoro-owner', session);
  });
  it('requires the expected account on history reads and validates the cursor', async () => {
    expect((await GET(new Request('http://localhost/api/pomodoro'))).status).toBe(403);
    expect((await GET(new Request('http://localhost/api/pomodoro?owner=someone-else'))).status).toBe(403);
    expect((await GET(new Request('http://localhost/api/pomodoro?owner=pomodoro-owner&cursor=not-a-uuid'))).status).toBe(400);
    const ok = await GET(new Request('http://localhost/api/pomodoro?owner=pomodoro-owner'));
    expect(ok.status).toBe(200);
    expect(mocks.page).toHaveBeenCalledWith('pomodoro-owner', undefined);
  });
});
