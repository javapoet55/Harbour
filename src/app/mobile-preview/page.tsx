'use client';

import { useEffect, useState } from 'react';
import { NexdoLogo } from '@/components/nexdo-logo';

export default function MobilePreviewPage() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const resize = () => setScale(Math.min(1, Math.max(0.3, (window.innerWidth - 24) / 464)));
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return <main className="min-h-dvh bg-[#dce5ef] px-2 py-6 text-center sm:px-6">
    <div className="mx-auto mb-3 w-[220px]"><NexdoLogo priority /></div><h1 className="text-xl font-bold text-[var(--ink)]">iPhone 17 Pro Max preview</h1>
    <p className="mx-auto mb-5 mt-2 max-w-md text-sm text-[var(--muted)]">Interactive 440 × 956 layout preview. Sign in if prompted. Changes here update your real account.</p>
    <div className="mx-auto" style={{ width: 464 * scale, height: 980 * scale }}><div className="w-[464px] rounded-[40px] bg-[#172033] p-3 shadow-2xl" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
      <iframe title="Nexdo mobile app — iPhone 17 Pro Max layout" src="/" allow="microphone; autoplay" className="block h-[956px] w-full rounded-[28px] border-0 bg-[#f4f1ea]" />
    </div></div>
    <p className="mt-4 text-xs text-[var(--muted)]">Responsive browser preview; device hardware and Safari behavior may differ.</p>
  </main>;
}
