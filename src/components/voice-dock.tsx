'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, X, CalendarDays, ChevronRight, Play, Pause } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'confirm' | 'error';

type Turn = {
  spoken: string;
  visual: { summary: string; appointments: string[]; tasks: string[]; overdue: string[]; next: string; rangeLabel: string };
  confirmation?: { prompt: string; actionId: string } | null;
};

export function VoiceDock() {
  const [state, setState] = useState<VoiceState>('idle');
  const [text, setText] = useState('');
  const [turn, setTurn] = useState<Turn | null>(null);
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speechRequestRef = useRef<AbortController | null>(null);
  const turnRequestRef = useRef(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const dockRef = useRef<HTMLElement | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mobileView, setMobileView] = useState(false);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    turnRequestRef.current++;
    speechRequestRef.current?.abort();
    recRef.current?.abort();
    audioRef.current?.pause();
    setVoiceLoading(false);
    setAudioPlaying(false);
    setState('idle');
  }, []);

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
      const elements = Array.from(dockRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href], audio[controls]') ?? []).filter((element) => element.getClientRects().length);
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
      void submit(transcript);
    };
    rec.onerror = () => {
      setState('error');
      setError('I could not hear that. Type the request instead.');
    };
    recRef.current = rec;
    // SpeechRecognition is created once; submit always reads the latest transcript argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(transcript: string, confirmActionId?: string) {
    if (!transcript.trim() && !confirmActionId) return;
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
        body: JSON.stringify({ transcript, confirmActionId }),
      });
      const data = await res.json();
      if (requestId !== turnRequestRef.current) return;
      if (!res.ok) throw new Error(data.error || 'Assistant failed');
      setTurn(data);
      setHistory((items) => [...items.slice(-5), { question: transcript, answer: data.spoken || data.visual.summary }]);
      setState(data.confirmation ? 'confirm' : 'idle');
      void speak(data.spoken);
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
    <section ref={dockRef} className={cn('harbor-voice-dock fixed inset-x-3 z-40 md:bottom-6 md:left-[272px] md:right-6', sheetOpen && mobileView && 'voice-sheet-open')} role={sheetOpen && mobileView ? 'dialog' : undefined} aria-modal={sheetOpen && mobileView ? true : undefined} aria-label={sheetOpen && mobileView ? 'Ask Harbor' : 'Voice assistant'}>
      <div className="voice-card harbor-card mx-auto max-w-3xl p-2 shadow-lg sm:p-3">
        <div className="mobile-voice-launcher md:hidden"><button ref={openerRef} onClick={() => setSheetOpen(true)}>Ask Harbor…</button><button aria-label="Ask Harbor by voice" className="mobile-voice-mic" onClick={listen}><Mic size={24} /></button></div>
        <header className="voice-sheet-header"><span className="voice-sheet-handle" /><h2>Ask Harbor</h2><button aria-label="Close Ask Harbor" onClick={closeSheet}><X size={23} /></button></header>
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
              placeholder={sheetOpen && mobileView ? 'Type a follow-up…' : 'Ask Harbor…'}
              aria-label="Text assistant"
            />
            <button type="submit" className="harbor-btn harbor-btn-brand px-3">Ask</button>
          </form>
        </div>
        <p className="voice-desktop-status mt-2 hidden text-xs uppercase tracking-wide text-[var(--faint)] sm:block">Voice is {state.replace('-', ' ')}</p>
        <div className="voice-conversation">
        {sheetOpen && mobileView && <>{history.slice(0, turn ? -1 : undefined).map((item, index) => <div key={index} className="voice-history"><p className="voice-question">{item.question}</p><p className="voice-answer">{item.answer}</p></div>)}{question && <p className="voice-question">{question}</p>}{!question && <div className="voice-welcome"><p>Let’s make room for what matters.</p><button onClick={() => void submit('Harbor, brief me')}>Brief me on my day</button><button onClick={() => void submit('Without changing anything, what should I focus on today and why?')}>What should I focus on?</button></div>}</>}
        {state === 'processing' && <p role="status" className="p-3 text-sm text-[var(--muted)]">Harbor is thinking…</p>}
        {state === 'listening' && <p role="status" className="p-3 text-sm text-[var(--muted)]">Listening…</p>}
        {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
        {turn && (
          <div className="voice-response mt-3 max-h-[32dvh] overflow-y-auto overscroll-contain rounded-xl bg-[var(--bg)] p-3 text-sm">
            <p className="voice-response-label font-semibold">{turn.visual.rangeLabel}</p>
            <p className="voice-answer mt-1 whitespace-pre-wrap text-[var(--muted)]">{turn.spoken || turn.visual.summary}</p>
            {turn.visual.tasks.length > 0 && <ul className="voice-results">{turn.visual.tasks.map((item, index) => <li key={`${index}-${item}`}><span>{index + 1}</span><p>{item.replace(/^\d+\.\s*/, '')}</p></li>)}</ul>}
            <p className="mt-2 text-xs text-[var(--muted)]">AI-generated voice · OpenAI Coral</p>
            {voiceLoading && <p role="status" className="mt-1 text-xs">Preparing voice…</p>}
            {voiceError && <p role="status" className="mt-1 text-xs">{voiceError}</p>}
            {audioUrl && <div className="voice-audio-strip md:hidden"><button aria-label={audioPlaying ? 'Pause spoken response' : 'Play spoken response'} onClick={() => { if (audioPlaying) audioRef.current?.pause(); else void audioRef.current?.play().catch(() => setVoiceError('Tap Play to try audio again.')); }}>{audioPlaying ? <Pause size={21} /> : <Play size={21} />}</button><div className={cn('voice-wave', audioPlaying && 'playing')} aria-hidden="true">{Array.from({ length: 27 }, (_, index) => <i key={index} style={{ height: `${6 + ((index * 17) % 25)}px`, animationDelay: `${index * 45}ms` }} />)}</div><span>{audioPlaying ? 'Speaking…' : 'Ready to play'}</span></div>}
            {audioUrl && <audio
              ref={audioRef} src={audioUrl} controls autoPlay className="voice-native-audio mt-2 w-full"
              aria-label="Play Harbour’s AI-generated response"
              onPlay={() => { setAudioPlaying(true); setState((current) => current === 'confirm' ? current : 'speaking'); }}
              onPause={() => { setAudioPlaying(false); setState((current) => current === 'confirm' ? current : 'idle'); }}
              onEnded={() => { setAudioPlaying(false); setState((current) => current === 'confirm' ? current : 'idle'); }}
              onError={() => setVoiceError('Audio could not be played. You can still read the answer.')}
            />}
            {turn.confirmation && (
              <div className="mt-3 flex gap-2">
                <button type="button" className="harbor-btn harbor-btn-brand" onClick={() => void submit('yes', turn.confirmation?.actionId)}>Apply changes</button>
                <button type="button" className="harbor-btn" onClick={() => { stopVoice(); setTurn(null); setState('idle'); }}>Cancel</button>
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
