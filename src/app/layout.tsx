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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
