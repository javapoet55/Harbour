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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speechRequestRef = useRef<AbortController | null>(null);
  const turnRequestRef = useRef(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState('');

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
    <section className="fixed inset-x-3 bottom-[4.6rem] z-40 md:bottom-6 md:left-[272px] md:right-6" aria-label="Voice assistant">
      <div className="harbor-card mx-auto max-w-3xl p-2 shadow-lg sm:p-3">
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
              className="harbor-input min-w-0"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask Harbor, or press the microphone"
              aria-label="Text assistant"
            />
            <button type="submit" className="harbor-btn harbor-btn-brand px-3">Ask</button>
          </form>
        </div>
        <p className="mt-2 hidden text-xs uppercase tracking-wide text-[var(--faint)] sm:block">Voice is {state.replace('-', ' ')}</p>
        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
        {turn && (
          <div className="mt-3 rounded-xl bg-[var(--bg)] p-3 text-sm">
            <p className="font-semibold">{turn.visual.rangeLabel}</p>
            <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">{turn.spoken || turn.visual.summary}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">AI-generated voice · OpenAI Coral</p>
            {voiceLoading && <p role="status" className="mt-1 text-xs">Preparing voice…</p>}
            {voiceError && <p role="status" className="mt-1 text-xs">{voiceError}</p>}
            {audioUrl && <audio
              ref={audioRef} src={audioUrl} controls autoPlay className="mt-2 w-full"
              aria-label="Play Harbour’s AI-generated response"
              onPlay={() => setState((current) => current === 'confirm' ? current : 'speaking')}
              onPause={() => setState((current) => current === 'confirm' ? current : 'idle')}
              onEnded={() => setState((current) => current === 'confirm' ? current : 'idle')}
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
