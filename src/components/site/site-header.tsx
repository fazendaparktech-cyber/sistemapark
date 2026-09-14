import Link from 'next/link';

import { Logo } from '../brand/logo';
import { buttonClasses } from '../ui/button';

const LINK =
  'hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/60 bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Conquista Park, página inicial" className="shrink-0">
          <Logo className="h-9 sm:h-10" />
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1">
          <Link href="/#ingressos" className={`${LINK} md:inline-flex`}>
            Ingressos
          </Link>
          <Link href="/meus-ingressos" className={`${LINK} sm:inline-flex`}>
            Meus ingressos
          </Link>
          <Link href="/contato" className={`${LINK} md:inline-flex`}>
            Contato
          </Link>
          <Link href="/comprar" className={buttonClasses('cta', 'md', 'ml-1')}>
            Comprar ingressos
          </Link>
        </nav>
      </div>
    </header>
  );
}
