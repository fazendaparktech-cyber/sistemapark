import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { buttonClasses } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5">
      <div className="max-w-md text-center">
        <Logo className="mx-auto h-10" />
        <p className="mt-10 font-mono text-sm font-medium text-pool-700">404</p>
        <h1 className="mt-2 font-display text-[30px] font-semibold tracking-[-0.02em] text-ink-900">
          Página não encontrada
        </h1>
        <p className="mt-2 text-[15px] leading-7 text-ink-500">
          O endereço pode ter mudado ou não existe mais.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link href="/" className={buttonClasses('secondary')}>
            Página inicial
          </Link>
          <Link href="/comprar" className={buttonClasses('cta')}>
            Comprar ingressos
          </Link>
        </div>
      </div>
    </main>
  );
}
