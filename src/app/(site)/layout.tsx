import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { todayIn } from '@/lib/dates';
import { isAppError } from '@/server/errors';
import { getPublicPark } from '@/server/parks/public';
import { getParkProfile } from '@/server/settings/service';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const parque = await getPublicPark().catch((erro: unknown) => {
    if (isAppError(erro)) return null;
    throw erro;
  });
  const perfil = parque ? await getParkProfile(parque.id) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-pop"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <SiteFooter profile={perfil} year={todayIn(parque?.timezone).slice(0, 4)} />
    </div>
  );
}
