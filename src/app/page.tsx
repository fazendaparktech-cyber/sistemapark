import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Waves } from '@/components/brand/waves';
import { DEFAULT_PARK_TIMEZONE, todayIn } from '@/lib/dates';

/**
 * Página inicial provisória. O site de vendas (fase 3) substitui esta página;
 * até lá ela diz a verdade: a venda online está em preparação.
 */
export default function HomePage() {
  const ano = todayIn(DEFAULT_PARK_TIMEZONE).slice(0, 4);

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-pool-50">
      <div
        aria-hidden
        className="absolute -inset-[25%] -z-10 animate-drift bg-[radial-gradient(38%_32%_at_25%_30%,rgb(79_198_219/0.45),transparent_70%),radial-gradient(34%_30%_at_78%_62%,rgb(143_212_234/0.6),transparent_70%),radial-gradient(26%_22%_at_62%_18%,rgb(253_185_42/0.28),transparent_70%)] blur-3xl"
      />
      <Waves className="absolute inset-x-0 bottom-0 -z-10 h-48 w-full text-pool-700/10 sm:h-64" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Logo className="h-11 sm:h-12" />
        <Link
          href="/entrar"
          className="rounded-lg px-3 py-2 text-sm font-semibold text-pool-800 transition-colors hover:bg-white/60 hover:text-pool-900"
        >
          Área da equipe
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-28 sm:px-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-grape-600">Ubatã · Bahia</p>
        <h1 className="mt-4 max-w-4xl font-display text-[44px] font-semibold leading-[0.98] tracking-[-0.035em] text-ink-950 sm:text-[76px]">
          O dia que sua família vai lembrar.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-ink-700">
          A compra de ingressos online do Conquista Park está chegando: escolha a data, garanta a vaga e entre
          com o QR Code no celular.
        </p>
        <p className="mt-10 inline-flex w-fit items-center gap-3 rounded-full bg-white/75 px-4 py-2 text-sm font-semibold text-ink-800 ring-1 ring-pool-200 backdrop-blur">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-citrus-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-citrus-500" />
          </span>
          Vendas online em preparação
        </p>
      </section>

      <footer className="px-5 py-6 text-center text-[13px] text-ink-500 sm:px-8">
        © {ano} Conquista Park
      </footer>
    </main>
  );
}
