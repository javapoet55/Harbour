'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
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
    setState('processing');
    setError('');
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, confirmActionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Assistant failed');
      setTurn(data);
      setState(data.confirmation ? 'confirm' : 'speaking');
      speak(data.spoken);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  function speak(phrase: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = 1.02;
    utterance.onend = () => setState((current) => (current === 'confirm' ? 'confirm' : 'idle'));
    window.speechSynthesis.speak(utterance);
  }

  function listen() {
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
    <section className="fixed inset-x-4 bottom-16 z-40 md:bottom-6 md:left-[272px] md:right-6" aria-label="Voice assistant">
      <div className="harbor-card mx-auto max-w-3xl p-3 shadow-lg">
        <div className="flex items-center gap-2">
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
              className="harbor-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask Harbor, or press the microphone"
              aria-label="Text assistant"
            />
            <button type="submit" className="harbor-btn harbor-btn-brand">Ask</button>
          </form>
        </div>
        <p className="mt-2 text-xs uppercase tracking-wide text-[var(--faint)]">Voice is {state.replace('-', ' ')}</p>
        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
        {turn && (
          <div className="mt-3 rounded-xl bg-[var(--bg)] p-3 text-sm">
            <p className="font-semibold">{turn.visual.rangeLabel}</p>
            <p className="mt-1 text-[var(--muted)]">{turn.visual.summary}</p>
            {turn.confirmation && (
              <div className="mt-3 flex gap-2">
                <button type="button" className="harbor-btn harbor-btn-brand" onClick={() => void submit('yes', turn.confirmation?.actionId)}>Apply changes</button>
                <button type="button" className="harbor-btn" onClick={() => { setTurn(null); setState('idle'); }}>Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
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
