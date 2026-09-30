'use client';
import { useState } from 'react';
import { SignupBotCheck } from '@/components/signup-bot-check';
export default function SignupChallenge() {
  const [token, setToken] = useState('');
  function complete() {
    const state = new URLSearchParams(window.location.search).get('state');
    if (!state || !/^[a-zA-Z0-9-]{16,80}$/.test(state)) return;
    // Fixed callback, never a caller-supplied redirect. No password/email passes through this page.
    window.location.href = `nexdo://signup-challenge?state=${encodeURIComponent(state)}&token=${encodeURIComponent(token)}`;
  }
  return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-bold">One quick security check</h1><p className="my-4">Help us keep Nexdo safe, then return to the app to finish creating your account.</p><SignupBotCheck onToken={setToken}/><button className="harbor-btn harbor-btn-brand mt-4" disabled={!token} onClick={complete}>Continue to Nexdo</button></main>;
}
