'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, BookOpen, MessageCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import type { SupportAnswer } from '@/server/support/answers';
import styles from './support-chat.module.css';

type Message = { role: 'user' | 'assistant'; content: string; sources?: SupportAnswer['sources']; mode?: SupportAnswer['mode'] };
const suggestions = ['What can Nexdo do?', 'Compare Free, Pro and Max', 'How do I create a task?', 'How do I connect Google Calendar?'];
export function SupportChat() {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy, error]);
  function close() { dialog.current?.close(); setOpen(false); launcher.current?.focus(); }
  async function send(question = draft) {
    if (!question.trim() || controller.current) return;
    const user: Message = { role: 'user', content: question.trim() };
    const previous = messages;
    setMessages([...previous, user]); setDraft(''); setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 25000);
    try {
      const response = await fetch('/api/support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ messages: [...previous.slice(-8), user].map(({ role, content }) => ({ role, content: content.slice(0, 2400) })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Chat is temporarily unavailable. Please try again.');
      setMessages([...previous, user, { role: 'assistant', content: result.answer, sources: result.sources, mode: result.mode }]);
    } catch (err) {
      setMessages(previous); setDraft(question);
      setError(err instanceof Error && err.name !== 'AbortError' ? err.message : 'That took too long. Please try again or browse Help.');
    } finally { clearTimeout(timeout); controller.current = null; setBusy(false); }
  }
  return <>
    <button ref={launcher} className={styles.launcher} aria-label="Open Nexdo support chat" aria-haspopup="dialog" aria-expanded={open} onClick={() => { dialog.current?.showModal(); setOpen(true); input.current?.focus(); }}><MessageCircle size={21} /><span>Ask support</span></button>
    <dialog ref={dialog} className={styles.panel} aria-labelledby="support-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
      <header className={styles.header}><div className={styles.mark}><Sparkles size={23} /></div><div><h2 id="support-title">Nexdo Support</h2><p>A little guidance. A clearer next step.</p></div><button onClick={close} aria-label="Close support chat"><X size={21} /></button></header>
      <div className={styles.toolbar}><span>AI help · Based on Nexdo’s guides</span><button disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); setDraft(''); input.current?.focus(); }} aria-label="Start a new support conversation"><RotateCcw size={15} /> New chat</button></div>
      <div className={styles.conversation} role="log" aria-label="Support conversation" aria-live="polite" aria-relevant="additions text">
        {!messages.length && <div className={styles.welcome}><span className={styles.eyebrow}>LET’S FIGURE IT OUT</span><h3>How can we help?</h3><p>Ask about getting started, your plan, or using Nexdo. I’ll point you to the right guide.</p><div className={styles.suggestions}>{suggestions.map(q => <button key={q} onClick={() => void send(q)} disabled={busy}>{q}<span aria-hidden="true">↗</span></button>)}</div></div>}
        {messages.map((m, i) => <article key={i} className={m.role === 'user' ? styles.user : styles.assistant}><span className={styles.speaker}>{m.role === 'user' ? 'You' : m.mode === 'articles' ? 'From the help library' : 'Nexdo Support'}</span><p>{m.content}</p>{!!m.sources?.length && <div className={styles.sources}>{m.sources.map(source => <a key={source.id} href={source.url} onClick={close}><BookOpen size={14} /><span>{source.title}<small>{source.platform}</small></span></a>)}</div>}</article>)}
        {busy && <p className={styles.thinking} role="status">Looking through Nexdo’s guides…</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div ref={bottom} />
      </div>
      <footer className={styles.footer}><form onSubmit={e => { e.preventDefault(); void send(); }}><label htmlFor="support-question" className={styles.srOnly}>Your question about Nexdo</label><textarea id="support-question" ref={input} rows={2} maxLength={1000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask a question about Nexdo…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /><button disabled={busy || !draft.trim()} type="submit" aria-label="Send question"><ArrowUp size={20} /></button></form><p>AI can make mistakes. Messages may be processed by OpenAI. Don’t share passwords or payment details. <a href="/help" onClick={close}>Browse Help</a></p></footer>
    </dialog>
  </>;
}
