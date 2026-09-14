import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { cn } from '@/components/ui/cn';
import { POLICY_LABELS, type Policies } from '@/lib/settings';
import { getPublicPark } from '@/server/parks/public';
import { getParkProfile, getPolicies } from '@/server/settings/service';

const POLITICAS: Record<string, keyof Policies> = {
  cancelamento: 'cancellation',
  termos: 'terms',
  privacidade: 'privacy',
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const chave = POLITICAS[slug];
  return chave ? { title: POLICY_LABELS[chave] } : {};
}

/** Texto da política: blocos separados por linha em branco; bloco que começa com "1. Título" vira seção. */
function blocos(texto: string): { titulo: string | null; paragrafos: string[] }[] {
  return texto
    .split(/\n\s*\n/)
    .map((bloco) => bloco.trim())
    .filter(Boolean)
    .map((bloco) => {
      const linhas = bloco
        .split('\n')
        .map((linha) => linha.trim())
        .filter(Boolean);
      const primeira = linhas[0] ?? '';
      const ehTitulo = /^\d+\.\s+\S/.test(primeira) && primeira.length <= 90 && linhas.length > 1;
      return { titulo: ehTitulo ? primeira : null, paragrafos: ehTitulo ? linhas.slice(1) : linhas };
    });
}

export default async function PoliticaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chave = POLITICAS[slug];
  if (!chave) notFound();

  const parque = await getPublicPark();
  const [politicas, perfil] = await Promise.all([getPolicies(parque.id), getParkProfile(parque.id)]);

  return (
    <div className="bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label="Políticas"
          className="flex gap-1 overflow-x-auto lg:sticky lg:top-24 lg:grid lg:content-start lg:overflow-visible"
        >
          {Object.entries(POLITICAS).map(([caminho, politica]) => (
            <Link
              key={caminho}
              href={`/politicas/${caminho}`}
              aria-current={caminho === slug ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                caminho === slug
                  ? 'bg-pool-50 text-pool-800'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
              )}
            >
              {POLICY_LABELS[politica]}
            </Link>
          ))}
        </nav>
        <article className="max-w-3xl">
          <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.03em] text-ink-950 sm:text-[42px]">
            {POLICY_LABELS[chave]}
          </h1>
          <p className="mt-3 text-sm text-ink-500">
            {perfil.legalName ?? perfil.name}
            {perfil.cnpj
              ? ` · CNPJ ${perfil.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`
              : ''}
          </p>
          <div className="mt-8 grid gap-7">
            {blocos(politicas[chave]).map((bloco, indice) => (
              <section key={`${bloco.titulo ?? 'bloco'}-${indice}`}>
                {bloco.titulo ? (
                  <h2 className="font-display text-lg font-semibold text-ink-900">
                    {bloco.titulo.replace(/^\d+\.\s+/, '')}
                  </h2>
                ) : null}
                {bloco.paragrafos.map((paragrafo) => (
                  <p key={paragrafo} className="mt-2 text-[15px] leading-7 text-ink-700">
                    {paragrafo}
                  </p>
                ))}
              </section>
            ))}
          </div>
          <p className="mt-10 rounded-2xl bg-canvas px-5 py-4 text-sm text-ink-600">
            Dúvidas sobre esta política?{' '}
            <Link href="/contato" className="font-semibold text-pool-700 hover:text-pool-800">
              Fale com o parque
            </Link>
            .
          </p>
        </article>
      </div>
    </div>
  );
}
