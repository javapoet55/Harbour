import Script from 'next/script';
import { headers } from 'next/headers';
import { SupportChat } from '@/components/support-chat';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: 'Nexdo — voice to-do and calendar',
  description: 'Ask what is coming up, capture tasks naturally, and never miss an important commitment.',
  manifest: '/manifest.json',
  applicationName: 'Nexdo',
  appleWebApp: { capable: true, title: 'Nexdo', statusBarStyle: 'default' },
  icons: { icon: '/favicon.ico', apple: '/nexdo-app-180.png' },
};

export const viewport: Viewport = {
  themeColor: '#5032f5',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The per-request nonce from the middleware's Content Security Policy. Reading it renders every page per
  // request, which a nonce requires: a prebuilt page would carry scripts the policy then blocks.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      {/* Extensions such as ClickUp add body attributes before React hydrates.
          Suppress only this element's mismatch; child hydration checks stay active. */}
      <body className="min-h-full antialiased" suppressHydrationWarning>{children}<SupportChat /><Script src="/firebase-bridge.js" strategy="afterInteractive" nonce={nonce} /></body>
    </html>
  );
}
