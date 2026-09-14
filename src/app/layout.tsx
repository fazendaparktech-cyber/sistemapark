import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui/toaster';

import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Conquista Park', template: '%s · Conquista Park' },
  description: 'Ingressos e gestão do Conquista Park, parque aquático em Ubatã, Bahia.',
  applicationName: 'Conquista Park',
};

export const viewport: Viewport = {
  themeColor: '#146f83',
};

/** Toda página é gerada por requisição: é o que permite a CSP com nonce (ver src/proxy.ts). */
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
