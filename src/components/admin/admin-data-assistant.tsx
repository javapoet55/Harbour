'use client';

import { FormEvent, KeyboardEvent, useRef, useState } from 'react';
import { Bot, Database, LoaderCircle, Send, Sparkles } from 'lucide-react';

function prompts(days: number) { return [
  `Summarize platform usage for the selected ${days === 1 ? 'day' : `${days}-day period`}.`,
  'Which features are used most, and what should I watch?',
  'How is voice usage changing compared with the previous period?',
]; }

export function AdminDataAssistant({ days, from, to }: { days: number; from: string; to: string }) {
  const form = useRef<HTMLFormElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [generatedAt, setGeneratedAt] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (value.length < 3 || busy) return;
    setBusy(true);
    setError('');
    setAnswer('');
    try {
      const response = await fetch('/api/admin/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: value, days, from, to }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The question could not be answered.');
      setAnswer(body.answer);
      setGeneratedAt(body.generatedAt || '');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The question could not be answered.');
    } finally {
      setBusy(false);
    }
  }

  function choosePrompt(prompt: string) {
    setQuestion(prompt);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    form.current?.requestSubmit();
  }

  return <section className="admin-data-assistant" aria-labelledby="admin-data-assistant-title">
    <div className="admin-data-assistant-heading">
      <span><Sparkles size={21}/></span>
      <div>
        <h2 id="admin-data-assistant-title">Ask Nexdo about your data</h2>
        <p>Get grounded answers from live Admin analytics. The assistant is read-only.</p>
      </div>
      <div className="admin-data-badge"><Database size={14}/> Live database</div>
    </div>
    <form ref={form} onSubmit={submit} className="admin-data-form">
      <label htmlFor="admin-data-question" className="admin-sr-only">Ask a question about Nexdo usage data</label>
      <textarea
        ref={textarea}
        id="admin-data-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={submitOnEnter}
        placeholder="Ask about users, plans, AI actions, voice usage, features, or estimated revenue…"
        maxLength={600}
        rows={2}
        disabled={busy}
      />
      <button type="submit" disabled={busy || question.trim().length < 3}>
        {busy ? <LoaderCircle className="admin-spin" size={18}/> : <Send size={18}/>}
        {busy ? 'Analyzing…' : 'Ask Nexdo'}
      </button>
    </form>
    <div className="admin-data-prompts" aria-label="Suggested questions">
      {prompts(days).map((prompt) => <button type="button" key={prompt} onClick={() => choosePrompt(prompt)} disabled={busy}>{prompt}</button>)}
    </div>
    {(answer || error) && <div className={`admin-data-answer${error ? ' error' : ''}`} role="status" aria-live="polite">
      <div className="admin-data-answer-icon"><Bot size={20}/></div>
      <div>
        <strong>{error ? 'Unable to answer' : 'Nexdo analysis'}</strong>
        <p>{error || answer}</p>
        {!error && generatedAt && <small>Based on Admin data refreshed {new Date(generatedAt).toLocaleString()}.</small>}
      </div>
    </div>}
  </section>;
}
