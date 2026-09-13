import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui/toaster';

import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const sans = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

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
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
