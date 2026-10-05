'use client';
import { useEffect, useRef, useState } from 'react';

type Turnstile = { render: (node: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
export function SignupBotCheck({ onToken, attempt = 0 }: { onToken: (token: string) => void; attempt?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  useEffect(() => { callback.current = onToken; }, [onToken]);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let widget: string | undefined;
    callback.current('');
    const fail = () => { if (!cancelled) { callback.current(''); setError('Security check unavailable. Please reload and try again.'); } };
    async function load() {
      const response = await fetch('/api/auth/signup-config', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const config = await response.json();
      if (!config.required) { if (!cancelled) callback.current('development'); return; }
      if (!config.siteKey) throw new Error();
      if (!window.turnstile) await new Promise<void>((resolve, reject) => {
        let script = document.querySelector<HTMLScriptElement>('script[data-signup-turnstile]');
        if (!script) { script = document.createElement('script'); script.dataset.signupTurnstile = 'true'; script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; document.head.appendChild(script); }
        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', reject, { once: true });
      });
      if (cancelled || !container.current || !window.turnstile) return;
      setError('');
      widget = window.turnstile.render(container.current, { sitekey: config.siteKey, action: 'signup', callback: (token: string) => callback.current(token), 'expired-callback': () => callback.current(''), 'error-callback': fail });
    }
    void load().catch(fail);
    return () => { cancelled = true; if (widget) window.turnstile?.remove(widget); };
  }, [attempt]);
  return <div><div ref={container} />{error && <p role="alert">{error}</p>}</div>;
}
