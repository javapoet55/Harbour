'use client';
import { useEffect } from 'react';
/**
 * The "Install Nexdo" banner is hidden on the web app for now. The component still cancels the
 * browser's own install prompt so that does not appear in its place; the browser menu's Install
 * option keeps working.
 */
export function InstallPrompt() {
  useEffect(() => {
    const onBefore = (event: Event) => event.preventDefault();
    window.addEventListener('beforeinstallprompt', onBefore);
    return () => window.removeEventListener('beforeinstallprompt', onBefore);
  }, []);
  return null;
}
declare global { interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; } }
