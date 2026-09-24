import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './admin.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Nexdo Admin',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body suppressHydrationWarning>{children}</body></html>;
}
