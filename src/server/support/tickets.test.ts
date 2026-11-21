import { afterEach, describe, expect, it, vi } from 'vitest';
const fetchMock = vi.hoisted(() => vi.fn());
const persist = vi.hoisted(() => vi.fn());
vi.mock('@/server/health/telemetry', () => ({ observedFetch: fetchMock }));
vi.mock('@/server/feedback/bugs', () => ({ persistReport: persist, redactSecrets: (s: string) => s.replace(/password\s*[:=]\s*\S+/gi, '[REDACTED]') }));
import { draftTicket, fallbackDraft, submitTicket } from './tickets';
import { bugReportMessage } from '@/server/email/bug-report';

const reply = (body: object) => ({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(body) }] }] }) });
afterEach(() => { vi.resetAllMocks(); delete process.env.OPENAI_API_KEY; });

describe('draftTicket', () => {
  it('uses the person’s own words when the AI is unavailable', async () => {
    const result = await draftTicket([{ role: 'user', content: 'Calendar does not sync\nsince Monday' }]);
    expect(result).toMatchObject({ ready: true, ticket: { title: 'Calendar does not sync', category: 'other', description: 'Calendar does not sync\nsince Monday' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('asks a follow-up question, then drafts the ticket', async () => {
    process.env.OPENAI_API_KEY = 'k';
    fetchMock.mockResolvedValueOnce(reply({ reply: 'Which screen were you on?', ready: false, title: '', category: 'other', description: '' }));
    expect(await draftTicket([{ role: 'user', content: 'It broke' }])).toEqual({ reply: 'Which screen were you on?', ready: false, ticket: null });
    fetchMock.mockResolvedValueOnce(reply({ reply: 'Here is your ticket.', ready: true, title: 'Tasks page crashes on save', category: 'bug', description: 'The user…' }));
    expect(await draftTicket([{ role: 'user', content: 'It broke' }, { role: 'assistant', content: 'Which screen?' }, { role: 'user', content: 'Tasks' }]))
      .toEqual({ reply: 'Here is your ticket.', ready: true, ticket: { title: 'Tasks page crashes on save', category: 'bug', description: 'The user…' } });
  });
  it('finishes by the third answer and never sends secrets to the model', async () => {
    process.env.OPENAI_API_KEY = 'k';
    fetchMock.mockResolvedValueOnce(reply({ reply: 'One more question?', ready: false, title: '', category: 'other', description: '' }));
    const msgs = [{ role: 'user' as const, content: 'a' }, { role: 'user' as const, content: 'b password: hunter2' }, { role: 'user' as const, content: 'c' }];
    const result = await draftTicket(msgs);
    expect(result.ready).toBe(true);
    const sent = JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).input);
    expect(sent.mustFinalize).toBe(true);
    expect(JSON.stringify(sent)).not.toContain('hunter2');
  });
  it('falls back when the model answer is malformed', async () => {
    process.env.OPENAI_API_KEY = 'k';
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'nope' }] }] }) });
    expect(await draftTicket([{ role: 'user', content: 'Help' }])).toEqual(fallbackDraft([{ role: 'user', content: 'Help' }]));
  });
});

describe('submitTicket', () => {
  it('saves a web ticket with its category, page and browser', async () => {
    persist.mockResolvedValue('BR-123456');
    const id = '7d3c1f0e-1b2a-4c3d-8e9f-0a1b2c3d4e5f';
    expect(await submitTicket({ id: 'u1' }, { id, title: 'Sync broken', category: 'bug', description: 'Details', page: '/tasks' }, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36')).toBe('BR-123456');
    const [, saved] = persist.mock.calls[0];
    expect(saved).toMatchObject({ id, description: 'Sync broken\n\nDetails', metadata: { platform: 'web', category: 'bug', page: '/tasks', browser: 'Chrome on macOS' } });
  });
  it('rejects bad input and odd page paths', async () => {
    await expect(submitTicket({ id: 'u1' }, { id: 'x', title: '', category: 'bug', description: '' }, '')).rejects.toThrow('INVALID_TICKET');
    persist.mockResolvedValue('BR-1');
    await submitTicket({ id: 'u1' }, { id: '7d3c1f0e-1b2a-4c3d-8e9f-0a1b2c3d4e5f', title: 't', category: 'other', description: 'd', page: 'https://evil.example/x' }, '');
    expect(persist.mock.calls[0][1].metadata.page).toBe('/');
  });
});

describe('support email', () => {
  it('labels web tickets as support tickets with web details', () => {
    const message = bugReportMessage({ reference: 'BR-1', description: 'Sync broken\n\nDetails', metadata: JSON.stringify({ platform: 'web', category: 'bug', page: '/tasks', browser: 'Chrome on macOS', timestamp: '2026-11-21T16:00:00Z', correlationID: 'c' }) });
    expect(message.subject).toBe('NexDo support ticket BR-1');
    expect(JSON.stringify(message)).toContain('Chrome on macOS');
    expect(JSON.stringify(message)).not.toContain('iOS version');
    expect(bugReportMessage({ reference: 'BR-2', description: 'x', metadata: '{}' }).subject).toBe('NexDo bug report BR-2');
  });
});
