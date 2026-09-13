import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Logo } from '@/components/brand/logo';
import { Waves } from '@/components/brand/waves';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Moldura das telas de acesso da equipe: marca à esquerda (computador), formulário à direita. */
export default function AcessoDaEquipeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative isolate hidden overflow-hidden bg-grape-950 lg:block">
        <div
          aria-hidden
          className="absolute -inset-[20%] -z-10 animate-drift bg-[radial-gradient(40%_34%_at_28%_32%,rgb(79_198_219/0.55),transparent_70%),radial-gradient(36%_30%_at_74%_66%,rgb(143_212_234/0.32),transparent_70%),radial-gradient(26%_22%_at_58%_18%,rgb(253_185_42/0.2),transparent_70%)] blur-2xl"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_35%,rgb(27_19_48/0.9)_100%)]"
        />
        <Waves className="absolute inset-x-0 bottom-0 -z-10 h-64 w-full text-white/[0.08]" />

        <div className="flex h-full flex-col justify-between p-12 xl:p-16">
          <Link href="/" className="w-fit">
            <Logo light className="h-14" />
          </Link>
          <div>
            <p className="font-display text-[46px] font-semibold leading-[1.02] tracking-[-0.03em] text-white xl:text-[56px]">
              Cada entrada,
              <br />
              cada venda,
              <br />
              <span className="text-pool-300">no lugar certo.</span>
            </p>
            <p className="mt-6 max-w-md text-[15px] leading-7 text-white/70">
              Sistema de gestão do Conquista Park: ingressos, portaria, caixa e financeiro num só lugar.
            </p>
          </div>
          <p className="text-[13px] text-white/55">Acesso restrito à equipe. Toda ação fica registrada.</p>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="w-fit lg:hidden">
          <Logo className="h-10" />
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          {children}
        </div>
        <p className="text-center text-[13px] text-ink-500">Conquista Park · Ubatã, Bahia</p>
      </main>
    </div>
  );
}
