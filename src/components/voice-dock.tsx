'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, X, CalendarDays, ChevronRight, Play, Pause, Sparkles, Target, AlarmClock, CalendarSearch, Sunrise, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ExecutiveRecommendation } from '@/lib/executive-contract';
import { useFocusSession, formatFocus } from './focus-session';

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'confirm' | 'error';

type Turn = {
  spoken: string;
  visual: { summary: string; appointments: string[]; tasks: string[]; overdue: string[]; next: string; rangeLabel: string; sections?: Array<{ title: string; items: string[] }> };
  confirmation?: { prompt: string; actionId: string } | null;
  executive?: ExecutiveRecommendation;
  voiceEnabled?: boolean;
  contextActionId?: string;
};

function AnswerSections({ visual }: { visual: Turn['visual'] }) {
  return <><p className="voice-response-summary">{visual.summary}</p><div className="voice-sections">{visual.sections?.map((section) => <section key={section.title} className="voice-section"><h3>{section.title}</h3><ul>{section.items.map((item, index) => <li key={`${section.title}-${index}`}>{item}</li>)}</ul></section>)}</div></>;
}

const PROMPT_SHORTCUTS = [
  { label: 'What should I do next?', detail: 'One best action for the time you have right now', prompt: 'What should I do next?', Icon: Target },
  {
    label: 'What’s my day looking like?',
    detail: 'See today’s calendar appointments, tasks, and overdue work',
    prompt: 'What’s my day looking like?',
    Icon: CalendarDays,
  },
  {
    label: 'Do I have any conflicts?',
    detail: 'Check overlaps, tight transitions, and workload risks',
    prompt: 'Do I have any conflicts?',
    Icon: ShieldAlert,
  },
  {
    label: 'Give me my full briefing',
    detail: 'Priorities, deadlines, conflicts, and your next move',
    prompt: 'Nexdo, brief me',
    Icon: Sparkles,
  },
  {
    label: 'Pick my Top 3 focus tasks',
    detail: 'Ranked by urgency, effort, and completion risk',
    prompt: 'What should I focus on today?',
    Icon: Target,
  },
  { label: 'Fix my afternoon', detail: 'Review a calmer plan before approving any changes', prompt: 'Fix my afternoon.', Icon: CalendarSearch },
  { label: 'I have 45 minutes', detail: 'Find useful work that fits this opening', prompt: 'I have 45 minutes free. What should I do?', Icon: Target },
  { label: 'Brief me on my way home', detail: 'A short spoken update on what still matters', prompt: "I'm driving home. What do I need to know?", Icon: Sunrise },
  {
    label: 'Show deadlines and risks',
    detail: 'See what is due in the next seven days',
    prompt: 'What deadlines are coming in the next 7 days?',
    Icon: AlarmClock,
  },
  {
    label: 'Find time in my schedule',
    detail: 'Surface open time around calendar commitments',
    prompt: 'Show me my free time today',
    Icon: CalendarSearch,
  },
  {
    label: 'Help me plan tomorrow',
    detail: 'Check whether tomorrow has enough capacity',
    prompt: 'Plan tomorrow so I can finish everything',
    Icon: Sunrise,
  },
] as const;

export function VoiceDock() {
  const focus = useFocusSession();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<VoiceState>('idle');
  const [text, setText] = useState('');
  const [turn, setTurn] = useState<Turn | null>(null);
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speechRequestRef = useRef<AbortController | null>(null);
  const turnRequestRef = useRef(0);
  const contextActionRef = useRef<string | undefined>(undefined);
  const submitRef = useRef<((prompt: string) => Promise<void>) | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const dockRef = useRef<HTMLElement | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mobileView, setMobileView] = useState(false);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Array<{ question: string; answer: string; visual?: Turn['visual'] }>>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      setSheetOpen(true);
      const detail = (event as CustomEvent<{ prompt?: string; contextActionId?: string }>).detail;
      if (detail?.prompt) { contextActionRef.current = detail.contextActionId; void submitRef.current?.(detail.prompt); }
    };
    window.addEventListener('harbor:open-assistant', open);
    return () => window.removeEventListener('harbor:open-assistant', open);
  }, []);
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    turnRequestRef.current++;
    speechRequestRef.current?.abort();
    recRef.current?.abort();
    audioRef.current?.pause();
    setVoiceLoading(false);
    setAudioPlaying(false);
    setState('idle');
    setQuestion('');
    setTurn(null);
    setHistory([]);
    contextActionRef.current = undefined;
    if (pathname !== '/') router.push('/');
  }, [pathname, router]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobileView(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!sheetOpen || !mobileView) return;
    const oldOverflow = document.body.style.overflow;
    const opener = openerRef.current;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSheet();
      if (event.key !== 'Tab') return;
      const elements = Array.from(dockRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href], summary, audio[controls]') ?? []).filter((element) => element.getClientRects().length);
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keys); opener?.focus(); };
  }, [sheetOpen, mobileView, closeSheet]);

  useEffect(() => {
    if (!dockRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty('--voice-dock-height', `${entry.target.classList.contains('voice-sheet-open') ? 68 : entry.target.getBoundingClientRect().height}px`);
    });
    observer.observe(dockRef.current);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--voice-dock-height'); };
  }, []);

  useEffect(() => () => {
    turnRequestRef.current++;
    speechRequestRef.current?.abort();
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  function stopVoice() {
    speechRequestRef.current?.abort();
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setVoiceLoading(false);
    setVoiceError('');
    setAudioPlaying(false);
  }

  useEffect(() => {
    const Ctor = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : undefined;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setText(transcript);
      void submitRef.current?.(transcript);
    };
    rec.onerror = () => {
      setState('error');
      setError('I could not hear that. Type the request instead.');
    };
    recRef.current = rec;
    // SpeechRecognition is created once; submit always reads the latest transcript argument.
  }, []);

  async function submit(transcript: string, confirmActionId?: string, rejectActionId?: string) {
    if (!transcript.trim() && !confirmActionId && !rejectActionId) return;
    const requestId = ++turnRequestRef.current;
    setSheetOpen(true);
    setQuestion(transcript);
    setTurn(null);
    setText('');
    stopVoice();
    setState('processing');
    setError('');
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, confirmActionId, rejectActionId, contextActionId: contextActionRef.current }),
      });
      const data = await res.json();
      if (requestId !== turnRequestRef.current) return;
      if (!res.ok) throw new Error(data.error || 'Assistant failed');
      setTurn(data);
      contextActionRef.current = data.contextActionId;
      setHistory((items) => [...items.slice(-5), { question: transcript, answer: data.spoken || data.visual.summary, visual: data.visual }]);
      setState(data.confirmation ? 'confirm' : 'idle');
      if (confirmActionId) window.dispatchEvent(new Event('harbor:tasks-updated'));
      if (data.voiceEnabled !== false) void speak(data.spoken);
    } catch (err) {
      if (requestId !== turnRequestRef.current) return;
      setState('error');
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  async function speak(phrase: string) {
    const controller = new AbortController();
    speechRequestRef.current = controller;
    setVoiceLoading(true);
    try {
      const response = await fetch('/api/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: phrase }), signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Voice unavailable. You can still read the answer.');
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setAudioUrl(url);
    } catch (err) {
      if (!controller.signal.aborted) setVoiceError(err instanceof Error ? err.message : 'Voice unavailable.');
    } finally {
      if (!controller.signal.aborted) setVoiceLoading(false);
    }
  }

  useEffect(() => { submitRef.current = submit; });

  function listen() {
    setSheetOpen(true);
    turnRequestRef.current++;
    stopVoice();
    setError('');
    setTurn(null);
    if (!recRef.current) {
      setError('This browser has no speech recognition. Type your request instead.');
      setState('error');
      return;
    }
    setState('listening');
    recRef.current.start();
  }

  return (
    <>
    {sheetOpen && mobileView && <div className="voice-sheet-backdrop" onClick={closeSheet} />}
    <section ref={dockRef} className={cn('harbor-voice-dock fixed inset-x-3 z-40 md:bottom-6 md:left-[272px] md:right-6', sheetOpen && mobileView && 'voice-sheet-open')} role={sheetOpen && mobileView ? 'dialog' : undefined} aria-modal={sheetOpen && mobileView ? true : undefined} aria-label={sheetOpen && mobileView ? 'Ask Nexdo' : 'Voice assistant'}>
      <div className="voice-card harbor-card mx-auto max-w-3xl p-2 shadow-lg sm:p-3">
        <div className="mobile-voice-launcher md:hidden"><button ref={openerRef} onClick={() => setSheetOpen(true)}>{pathname === '/calendar' ? 'Ask Nexdo about my schedule…' : 'Ask Nexdo…'}</button><button aria-label="Ask Nexdo by voice" className="mobile-voice-mic" onClick={listen}><Mic size={24} /></button></div>
        <header className="voice-sheet-header"><span className="voice-sheet-handle" /><h2>Ask Nexdo</h2><button aria-label="Close Ask Nexdo" onClick={closeSheet}><X size={23} /></button></header>
        <div className="voice-composer flex items-center gap-2">
          <button
            type="button"
            className={cn('mic harbor-btn size-11 rounded-full p-0', state !== 'idle' && 'font-bold')}
            data-state={state}
            aria-label={`Microphone, ${state}`}
            onClick={listen}
          >
            <Mic className="size-5" />
          </button>
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(text);
            }}
          >
            <input
              ref={inputRef} className="harbor-input min-w-0"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={sheetOpen && mobileView ? 'Type a follow-up…' : 'Ask Nexdo…'}
              aria-label="Text assistant"
            />
            <button type="submit" className="harbor-btn harbor-btn-brand px-3">Ask</button>
          </form>
        </div>
        <p className="voice-desktop-status mt-2 hidden text-xs uppercase tracking-wide text-[var(--faint)] sm:block">Voice is {state.replace('-', ' ')}</p>
        <div className="voice-conversation">
        {sheetOpen && mobileView && <>{history.slice(0, turn ? -1 : undefined).map((item, index) => <div key={index} className="voice-history"><p className="voice-question">{item.question}</p>{item.visual?.sections?.length ? <details><summary className="voice-response-summary">Previous answer · {item.visual.summary}</summary><AnswerSections visual={item.visual} /></details> : <p className="voice-answer">{item.answer}</p>}</div>)}{question && <p className="voice-question">{question}</p>}{!question && <div className="voice-welcome"><p>Let’s make room for what matters.</p><div className="voice-prompt-list" aria-label="Suggested questions">{PROMPT_SHORTCUTS.map(({ label, detail, prompt, Icon }) => <button key={label} type="button" className="voice-prompt" onClick={() => void submit(prompt)}><Icon size={19} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)}</div></div>}</>}
        {state === 'processing' && <p role="status" className="p-3 text-sm text-[var(--muted)]">Nexdo is thinking…</p>}
        {state === 'listening' && <p role="status" className="p-3 text-sm text-[var(--muted)]">Listening…</p>}
        {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
        {turn && (
          <div className="voice-response mt-3 max-h-[32dvh] overflow-y-auto overscroll-contain rounded-xl bg-[var(--bg)] p-3 text-sm">
            <p className="voice-response-label font-semibold">{turn.visual.rangeLabel}</p>
            {turn.visual.sections?.length ? <AnswerSections visual={turn.visual} /> : <p className="voice-answer mt-1 whitespace-pre-wrap text-[var(--muted)]">{turn.spoken || turn.visual.summary}</p>}
            {turn.executive && <div className="nexdo-executive">
              {turn.executive.conversationalSummary !== turn.executive.summary && <p className="nexdo-executive-explanation">{turn.executive.conversationalSummary}</p>}
              {turn.executive.proposedScheduleChanges.length > 0 && <details open><summary>Review {turn.executive.proposedScheduleChanges.length} proposed changes</summary><div className="nexdo-plan-changes">{turn.executive.proposedScheduleChanges.map((move) => {
                const label = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-US', { timeZone: turn.executive!.timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : 'Unscheduled';
                return <article key={move.taskId}><h3>{move.title}</h3><div><span>Before</span><p>{label(move.before)}</p></div><div><span>After</span><p>{label(move.after)} · {move.durationMin} min</p></div></article>;
              })}</div><p>Only the listed Nexdo task blocks will move. Calendar appointments stay unchanged.</p></details>}
              {turn.executive.recommendedActions.filter((action) => action.type === 'START_FOCUS').map((action) => <button key={action.taskId} type="button" disabled={focus.loading || focus.session?.taskId === action.taskId} className="harbor-btn harbor-btn-brand w-full" onClick={() => void focus.start(action.taskId!, turn.executive!.priorities.find((item) => item.taskId === action.taskId)?.title ?? 'Focus', action.durationMin, true)}>{focus.loading ? 'Starting…' : focus.session?.taskId === action.taskId ? 'Focus session started' : action.label}</button>)}
              {focus.session && <div className="nexdo-inline-focus"><strong>{focus.session.title} · {formatFocus(focus.seconds)}</strong><button className="harbor-btn" type="button" onClick={focus.toggle}>{focus.session.endsAt ? 'Pause' : 'Resume'}</button></div>}
              {focus.error && <p role="alert">{focus.error}</p>}
              <details><summary>How Nexdo decided</summary><ul>{turn.executive.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
              <div className="nexdo-followups" aria-label="Follow-up questions">{(turn.executive.intent === 'DRIVING_BRIEFING' ? ['Tell me about the conflict.', 'What can wait?', "What's my first meeting?"] : turn.executive.intent === 'FIX_SCHEDULE' ? ["Don't move that meeting.", 'What can wait?'] : ['Why?', 'Give me another one.', "I don't want to work on that."]).map((prompt) => <button className="harbor-btn" key={prompt} onClick={() => void submit(prompt)}>{prompt}</button>)}</div>
            </div>}
            {turn.visual.tasks.length > 0 && (!turn.visual.sections?.length || turn.confirmation) && <ul className="voice-results">{turn.visual.tasks.map((item, index) => <li key={`${index}-${item}`}><span>{index + 1}</span><p>{item.replace(/^\d+\.\s*/, '')}</p></li>)}</ul>}
            {audioUrl && <p className="nexdo-voice-disclosure mt-2 text-xs text-[var(--muted)]">AI-generated voice · OpenAI Coral</p>}
            {voiceLoading && <p role="status" className="mt-1 text-xs">Preparing voice…</p>}
            {voiceError && <details className="mt-2 text-xs"><summary>Audio unavailable · read the answer above</summary><p>{voiceError}</p></details>}
            {audioUrl && <div className="voice-audio-strip md:hidden"><button aria-label={audioPlaying ? 'Pause spoken response' : 'Play spoken response'} onClick={() => { if (audioPlaying) audioRef.current?.pause(); else void audioRef.current?.play().catch(() => setVoiceError('Tap Play to try audio again.')); }}>{audioPlaying ? <Pause size={21} /> : <Play size={21} />}</button><div className={cn('voice-wave', audioPlaying && 'playing')} aria-hidden="true">{Array.from({ length: 27 }, (_, index) => <i key={index} style={{ height: `${6 + ((index * 17) % 25)}px`, animationDelay: `${index * 45}ms` }} />)}</div><span>{audioPlaying ? 'Speaking…' : 'Ready to play'}</span></div>}
            {audioUrl && <audio
              ref={audioRef} src={audioUrl} controls autoPlay className="voice-native-audio mt-2 w-full"
              aria-label="Play Nexdo’s AI-generated response"
              onPlay={() => { setAudioPlaying(true); setState((current) => current === 'confirm' ? current : 'speaking'); }}
              onPause={() => { setAudioPlaying(false); setState((current) => current === 'confirm' ? current : 'idle'); }}
              onEnded={() => { setAudioPlaying(false); setState((current) => current === 'confirm' ? current : 'idle'); }}
              onError={() => setVoiceError('Audio could not be played. You can still read the answer.')}
            />}
            {turn.confirmation && (
              <div className="mt-3 flex gap-2">
                <button type="button" className="harbor-btn harbor-btn-brand" onClick={() => void submit('yes', turn.confirmation?.actionId)}>Apply changes</button>
                <button type="button" className="harbor-btn" onClick={() => void submit('Keep my current plan', undefined, turn.confirmation?.actionId)}>Keep current plan</button>
              </div>
            )}
          </div>
        )}
        {turn && <Link href="/planner" className="voice-plan-link" onClick={closeSheet}><CalendarDays size={21} />Show my plan<ChevronRight size={18} /></Link>}
        </div>
      </div>
    </section>
    </>
  );
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    abort(): void;
    lang: string;
    interimResults: boolean;
    start: () => void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: (() => void) | null;
  }
  interface SpeechRecognitionEvent {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }
}
