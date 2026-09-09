import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireUser } from '@/server/auth';
import { runConversationalAgent } from '@/server/conversational-agent';
vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/server/conversational-agent', () => ({ runConversationalAgent: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const request = (body: unknown) => new Request('http://localhost/api/assistant', { method: 'POST', body: JSON.stringify(body) });
it('requires authentication before accessing context', async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await POST(request({ transcript: 'What should I focus on today?' }))).status).toBe(401);
  expect(runConversationalAgent).not.toHaveBeenCalled();
});
it('validates untrusted transcript and mutually exclusive approval fields', async () => {
  vi.mocked(requireUser).mockResolvedValue({ id: 'owner' } as Awaited<ReturnType<typeof requireUser>>);
  for (const body of [{}, { transcript: 15 }, { transcript: 'a'.repeat(4001) }, { confirmActionId: 'a', rejectActionId: 'a' }]) expect((await POST(request(body))).status).toBe(400);
  expect(runConversationalAgent).not.toHaveBeenCalled();
});
it('returns owned results, voice preference and private cache headers', async () => {
  vi.mocked(requireUser).mockResolvedValue({ id: 'owner', preference: { voiceEnabled: false } } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(runConversationalAgent).mockResolvedValue({
    spoken: 'Answer',
    visual: { summary: 'Answer', tasks: [], appointments: [], overdue: [], next: '', rangeLabel: 'Answer' },
    transcript: 'I have 45 minutes.',
    intent: { intent: 'UNKNOWN', confidence: 1, confirmationRequired: false, raw: 'I have 45 minutes.' },
  } as unknown as Awaited<ReturnType<typeof runConversationalAgent>>);
  const response = await POST(request({ transcript: 'I have 45 minutes.' }));
  expect(runConversationalAgent).toHaveBeenCalledWith('owner', 'I have 45 minutes.', undefined, undefined, undefined);
  expect(await response.json()).toMatchObject({ voiceEnabled: false, spoken: 'Answer' });
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('returns a recoverable 409 for stale schedule approval', async () => {
  vi.mocked(requireUser).mockResolvedValue({ id: 'owner' } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(runConversationalAgent).mockRejectedValue(new Error('STALE_REPLAN'));
  expect((await POST(request({ confirmActionId: 'old' }))).status).toBe(409);
});

it('blocks unsafe policy input before running the assistant', async () => {
  vi.mocked(requireUser).mockResolvedValue({ id: 'owner', preference: { voiceEnabled: true } } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(runConversationalAgent).mockResolvedValue({ spoken: 'ok' } as Awaited<ReturnType<typeof runConversationalAgent>>);

  const response = await POST(request({ transcript: 'Why is the sky blue?' }));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(runConversationalAgent).not.toHaveBeenCalled();
  expect(body.spoken).toMatch(/Ask me about your tasks|I can’t help with that request/i);
});

it('sanitizes unsafe assistant output after model run', async () => {
  vi.mocked(requireUser).mockResolvedValue({ id: 'owner', preference: { voiceEnabled: true } } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(runConversationalAgent).mockResolvedValue({
    spoken: 'Sky is blue because of Rayleigh scattering.',
    visual: {
      summary: 'Sky is blue because of scattering.',
      sections: [{ title: 'Answer', items: ['Why is the sky blue?'] }, { title: 'Actions', items: ['List tasks'] }],
      tasks: [],
      appointments: [],
      overdue: [],
      next: '',
      rangeLabel: 'Answer',
    },
    transcript: 'something',
    intent: { intent: 'UNKNOWN', confidence: 1, confirmationRequired: false, raw: 'something' },
  } as unknown as Awaited<ReturnType<typeof runConversationalAgent>>);

  const response = await POST(request({ transcript: 'What should I work on next?' }));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.spoken).toMatch(/Ask me about your tasks|I can’t help with that request|I can’t help with political|I can’t help with/);
  expect(body.visual.sections).toEqual([{ title: 'AI Response', items: [body.spoken] }]);
});
