import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: 'Harbor — voice to-do and calendar',
  description: 'Ask what is coming up, capture tasks naturally, and never miss an important commitment.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#3d5a80',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
