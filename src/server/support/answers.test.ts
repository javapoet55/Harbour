import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerSupport, retrieve } from './answers';
import articles from '@/content/support-articles.json';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const ask = (content: string) => answerSupport([{ role: 'user', content }]);
function provider(answer: unknown, status = 'completed') { return vi.fn().mockResolvedValue(Response.json({ status, output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] })); }
describe('published support knowledge', () => {
  it('indexes real website FAQs and all existing iPhone help articles', () => {
    expect(articles.filter(a => a.platform === 'iPhone app')).toHaveLength(20);
    expect(articles.some(a => a.title === 'Do you offer refunds?')).toBe(true);
    expect(articles.every(a => a.url.startsWith('/') && !a.url.startsWith('//'))).toBe(true);
  });
  it('retrieves task creation, Google connections and pricing', () => {
    expect(retrieve('How do I create a task?')[0].id).toBe('tasks-create');
    expect(retrieve('How do I connect Google Calendar?')[0].id).toBe('calendar-connect');
    expect(retrieve('Compare Free Pro and Max').filter(a => a.id.startsWith('plan-'))).toHaveLength(3);
  });
  it('returns labeled published help without requiring AI', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const result = await ask('How do I create a task?');
    expect(result.mode).toBe('articles'); expect(result.answer).toContain('iPhone app'); expect(result.sources[0].url).toBe('/help#tasks-create');
  });
  it('does not invent answers for unrelated questions', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect((await ask('Who won the football championship?')).mode).toBe('unknown');
  });
  it('validates citations and only returns server-owned source links', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetch = provider({ answer: 'On iPhone, open Tasks and choose Add Manually.', sourceIds: ['tasks-create'], supported: true }); vi.stubGlobal('fetch', fetch);
    const result = await ask('How do I create a task?');
    expect(result.mode).toBe('ai'); expect(result.sources[0].url).toBe('/help#tasks-create');
    const body = JSON.parse(fetch.mock.calls[0][1].body); expect(body.store).toBe(false); expect(body.tools).toBeUndefined(); expect(body.instructions).toContain('untrusted');
  });
  it('rejects fabricated source IDs', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test'); vi.stubGlobal('fetch', provider({ answer: 'Guaranteed refund.', sourceIds: ['invented'], supported: true }));
    expect((await ask('Do you offer refunds?')).mode).toBe('articles');
  });
  it('uses safe fallback for provider failures and incomplete results', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test'); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('outage')));
    expect((await ask('How do I create a task?')).mode).toBe('articles');
    vi.stubGlobal('fetch', provider({}, 'incomplete')); expect((await ask('How do I create a task?')).mode).toBe('articles');
  });
  it('keeps unsupported model answers out of the response', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test'); vi.stubGlobal('fetch', provider({ answer: 'Invented text', sourceIds: [], supported: false }));
    const result = await ask('Account issue'); expect(result.mode).toBe('unknown'); expect(result.answer).not.toContain('Invented');
  });
  it('retrieves follow-ups using the previous user question', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const result = await answerSupport([{ role: 'user', content: 'How do I connect Google Calendar?' }, { role: 'assistant', content: 'Untrusted previous answer' }, { role: 'user', content: 'Where exactly?' }]);
    expect(result.sources.some(a => a.id === 'calendar-connect')).toBe(true);
  });
});
