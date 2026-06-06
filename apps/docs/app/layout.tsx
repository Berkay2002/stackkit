import './globals.css';

import { RootProvider } from 'fumadocs-ui/provider/next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Stackkit Docs',
    template: '%s | Stackkit Docs',
  },
  description:
    'Documentation for Stackkit — a TypeScript CLI for generating and maintaining multi-language monorepos.',
  openGraph: {
    type: 'website',
    siteName: 'Stackkit Docs',
    title: 'Stackkit Docs',
    description:
      'A TypeScript CLI for generating and maintaining multi-language monorepos.',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
