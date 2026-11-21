'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, BookOpen, CheckCircle2, MessageCircle, RotateCcw, Sparkles, TicketPlus, X } from 'lucide-react';
import type { SupportAnswer } from '@/server/support/answers';
import styles from './support-chat.module.css';

type Message = { role: 'user' | 'assistant'; content: string; sources?: SupportAnswer['sources']; mode?: SupportAnswer['mode'] };
type Category = 'bug' | 'account' | 'billing' | 'feature' | 'question' | 'other';
type Ticket = { id: string; title: string; category: Category; description: string };
const suggestions = ['What can Nexdo do?', 'How do I create a task?', 'How do I connect Google Calendar?'];
const CATEGORIES: [Category, string][] = [['bug', 'Something isn’t working'], ['account', 'Account or sign-in'], ['billing', 'Billing or plan'], ['feature', 'Feature request'], ['question', 'Question'], ['other', 'Other']];
const SUPPORT_EMAIL = 'support@nexdoapp.com';
const TICKET_OPENING = 'Sure, I’ll help you create a support ticket. What’s going on? Tell me what you were trying to do and what happened instead.';
const SIGN_IN_FIRST = `Please sign in to Nexdo to create a support ticket, so our team can reply to your account email. You can also email ${SUPPORT_EMAIL}.`;

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
  // Ticket mode: the assistant gathers the details, drafts a ticket, and the person reviews and submits it.
  const [mode, setMode] = useState<'help' | 'ticket'>('help');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [submitted, setSubmitted] = useState('');
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy, error, ticket, submitted]);
  function close() { dialog.current?.close(); setOpen(false); launcher.current?.focus(); }
  function reset() { controller.current?.abort(); setMode('help'); setMessages([]); setTicket(null); setSubmitted(''); setError(''); setDraft(''); input.current?.focus(); }

  async function startTicket() {
    controller.current?.abort();
    setMode('ticket'); setTicket(null); setSubmitted(''); setError(''); setDraft('');
    let known = signedIn;
    if (known === null) {
      try { known = (await fetch('/api/me', { cache: 'no-store' })).ok; } catch { known = false; }
      setSignedIn(known);
    }
    setMessages([{ role: 'assistant', content: known ? TICKET_OPENING : SIGN_IN_FIRST }]);
    if (known) input.current?.focus();
  }

  async function send(question = draft) {
    if (!question.trim() || controller.current) return;
    const user: Message = { role: 'user', content: question.trim() };
    const previous = messages;
    setMessages([...previous, user]); setDraft(''); setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 25000);
    try {
      if (mode === 'ticket') {
        const response = await fetch('/api/support/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
          body: JSON.stringify({ action: 'draft', messages: [...previous.slice(-10), user].map(({ role, content }) => ({ role, content: content.slice(0, 2400) })) }) });
        const result = await response.json();
        if (response.status === 401) { setSignedIn(false); throw new Error(SIGN_IN_FIRST); }
        if (!response.ok) throw new Error(result.error || 'Couldn’t reach support right now. Please try again.');
        setMessages([...previous, user, { role: 'assistant', content: result.reply }]);
        if (result.ready && result.ticket) setTicket({ id: crypto.randomUUID(), ...result.ticket });
        return;
      }
      const response = await fetch('/api/support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ messages: [...previous.slice(-8), user].map(({ role, content }) => ({ role, content: content.slice(0, 2400) })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Chat is temporarily unavailable. Please try again.');
      setMessages([...previous, user, { role: 'assistant', content: result.answer, sources: result.sources, mode: result.mode }]);
    } catch (err) {
      setMessages(previous); setDraft(question);
      setError(err instanceof Error && err.name !== 'AbortError' ? err.message : 'That took too long. Please try again.');
    } finally { clearTimeout(timeout); controller.current = null; setBusy(false); }
  }

  async function submitTicket() {
    if (!ticket || controller.current) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/support/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', id: ticket.id, title: ticket.title.trim(), category: ticket.category, description: ticket.description.trim(), page: window.location.pathname.slice(0, 200) }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { setSignedIn(false); throw new Error(SIGN_IN_FIRST); }
      if (!response.ok || !result.reference) throw new Error(result.error || 'Couldn’t create the ticket. Please try again.');
      setSubmitted(result.reference);
      setTicket(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t create the ticket. Please try again.');
    } finally { setBusy(false); }
  }

  const canType = mode === 'help' || (signedIn !== false && !ticket && !submitted);
  return <>
    <button ref={launcher} className={styles.launcher} aria-label="Open Nexdo support chat" aria-haspopup="dialog" aria-expanded={open} onClick={() => { dialog.current?.showModal(); setOpen(true); input.current?.focus(); }}><MessageCircle size={21} /><span>Ask support</span></button>
    <dialog ref={dialog} className={styles.panel} aria-labelledby="support-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
      <header className={styles.header}><div className={styles.mark}><Sparkles size={23} /></div><div><h2 id="support-title">Nexdo Support</h2><p>A little guidance. A clearer next step.</p></div><button onClick={close} aria-label="Close support chat"><X size={21} /></button></header>
      <div className={styles.toolbar}>
        <span>{mode === 'ticket' ? 'Support ticket · Sent to the Nexdo team' : 'AI help · Based on Nexdo’s guides'}</span>
        <div className={styles.toolbarActions}>
          {mode === 'help' && <button className={styles.ticketButton} disabled={busy} onClick={() => void startTicket()}><TicketPlus size={15} /> Create ticket</button>}
          <button disabled={busy || (mode === 'help' && !messages.length)} onClick={reset} aria-label="Start a new support conversation"><RotateCcw size={15} /> New chat</button>
        </div>
      </div>
      <div className={styles.conversation} role="log" aria-label="Support conversation" aria-live="polite" aria-relevant="additions text">
        {mode === 'help' && !messages.length && <div className={styles.welcome}><span className={styles.eyebrow}>LET’S FIGURE IT OUT</span><h3>How can we help?</h3><p>Ask about getting started, your plan, or using Nexdo. I’ll point you to the right guide.</p><div className={styles.suggestions}>{suggestions.map(q => <button key={q} onClick={() => void send(q)} disabled={busy}>{q}<span aria-hidden="true">↗</span></button>)}</div></div>}
        {messages.map((m, i) => <article key={i} className={m.role === 'user' ? styles.user : styles.assistant}><span className={styles.speaker}>{m.role === 'user' ? 'You' : m.mode === 'articles' ? 'From the help library' : 'Nexdo Support'}</span><p>{m.content}</p>{!!m.sources?.length && <div className={styles.sources}>{m.sources.map(source => <a key={source.id} href={source.url} onClick={close}><BookOpen size={14} /><span>{source.title}<small>{source.platform}</small></span></a>)}</div>}</article>)}
        {ticket && <form className={styles.ticket} aria-label="Review your ticket" onSubmit={e => { e.preventDefault(); void submitTicket(); }}>
          <span className={styles.eyebrow}>REVIEW YOUR TICKET</span>
          <label>Title<input value={ticket.title} maxLength={120} required disabled={busy} onChange={e => setTicket({ ...ticket, title: e.target.value })} /></label>
          <label>Category<select value={ticket.category} disabled={busy} onChange={e => setTicket({ ...ticket, category: e.target.value as Category })}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Details<textarea value={ticket.description} rows={6} maxLength={2000} required disabled={busy} onChange={e => setTicket({ ...ticket, description: e.target.value })} /></label>
          <div className={styles.ticketActions}>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setTicket(null); input.current?.focus(); }}>Add more details</button>
            <button type="submit" className={styles.primary} disabled={busy || !ticket.title.trim() || !ticket.description.trim()}>{busy ? 'Submitting…' : 'Submit ticket'}</button>
          </div>
        </form>}
        {submitted && <div className={styles.done} role="status"><CheckCircle2 size={22} /><div><strong>Ticket {submitted} created</strong><p>Our support team has it and will reply to your account email. Keep this reference if you contact us at {SUPPORT_EMAIL}.</p></div></div>}
        {busy && !ticket && <p className={styles.thinking} role="status">{mode === 'ticket' ? 'Writing up your ticket…' : 'Looking through Nexdo’s guides…'}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div ref={bottom} />
      </div>
      <footer className={styles.footer}>
        {canType && <form onSubmit={e => { e.preventDefault(); void send(); }}><label htmlFor="support-question" className={styles.srOnly}>{mode === 'ticket' ? 'Describe the problem' : 'Your question about Nexdo'}</label><textarea id="support-question" ref={input} rows={2} maxLength={1000} value={draft} onChange={e => setDraft(e.target.value)} placeholder={mode === 'ticket' ? 'Describe the problem…' : 'Ask a question about Nexdo…'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /><button disabled={busy || !draft.trim()} type="submit" aria-label={mode === 'ticket' ? 'Send' : 'Send question'}><ArrowUp size={20} /></button></form>}
        <p>For questions, please email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      </footer>
    </dialog>
  </>;
}
