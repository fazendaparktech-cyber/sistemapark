import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { NoPermission } from '@/components/admin/no-permission';
import { ParkProfileForm, PoliciesForm, SalesSettingsForm } from '@/components/admin/settings/settings-forms';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHeader } from '@/components/ui/page-header';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getReadiness } from '@/server/settings/readiness';
import { getParkProfile, getPolicies, getSalesSettings } from '@/server/settings/service';

export const metadata: Metadata = { title: 'Configurações' };

const SECOES = [
  { id: 'prontidao', label: 'Prontidão para vender' },
  { id: 'vendas-online', label: 'Vendas online' },
  { id: 'dados-do-parque', label: 'Dados do parque' },
  { id: 'politicas', label: 'Políticas' },
];

export default async function ConfiguracoesPage() {
  const auth = await requirePageAuth();
  if (!can(auth, 'settings.view')) return <NoPermission />;

  const [vendas, parque, politicas, prontidao] = await Promise.all([
    getSalesSettings(auth.park.id),
    getParkProfile(auth.park.id),
    getPolicies(auth.park.id),
    getReadiness(auth),
  ]);
  const podeGerenciar = can(auth, 'settings.manage');
  const pendentes = prontidao.filter((item) => !item.ok).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Configurações"
        description="Regras da venda online, dados do parque, políticas do site e o que falta para vender."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Seções das configurações"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:sticky lg:top-24 lg:mx-0 lg:grid lg:overflow-visible lg:px-0"
        >
          {SECOES.map((secao) => (
            <a
              key={secao.id}
              href={`#${secao.id}`}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {secao.label}
            </a>
          ))}
        </nav>

        <div className="grid gap-6">
          <Card id="prontidao" className="scroll-mt-24">
            <CardHeader
              title="Prontidão para vender"
              description={
                pendentes === 0
                  ? 'Tudo pronto para vender.'
                  : `${pendentes} ${pendentes === 1 ? 'item pendente' : 'itens pendentes'} antes de abrir as vendas ao público.`
              }
            />
            <CardContent>
              <ul className="grid gap-3">
                {prontidao.map((item) => (
                  <li
                    key={item.key}
                    className={cn(
                      'flex gap-3 rounded-xl px-4 py-3 ring-1 ring-inset',
                      item.ok ? 'bg-success-50/60 ring-success-600/15' : 'bg-warning-50 ring-warning-600/20',
                    )}
                  >
                    {item.ok ? (
                      <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-700" aria-hidden />
                    ) : (
                      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-700" aria-hidden />
                    )}
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-ink-900">
                        {item.title}
                        <span className="sr-only">{item.ok ? ': pronto' : ': pendente'}</span>
                      </p>
                      <p className="mt-0.5 break-words leading-6 text-ink-600">{item.detail}</p>
                      {item.href && !item.ok ? (
                        <Link
                          href={item.href}
                          className="mt-1 inline-block font-semibold text-pool-700 hover:text-pool-800"
                        >
                          Resolver
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card id="vendas-online" className="scroll-mt-24">
            <CardHeader
              title="Vendas online"
              description="Como o site vende: prazos, limites e antecedência."
            />
            <CardContent>
              <SalesSettingsForm initial={vendas} canManage={podeGerenciar} />
            </CardContent>
          </Card>

          <Card id="dados-do-parque" className="scroll-mt-24">
            <CardHeader
              title="Dados do parque"
              description="Identificação e contato usados no site, nos e-mails e nas políticas."
            />
            <CardContent>
              <ParkProfileForm initial={parque} canManage={podeGerenciar} />
            </CardContent>
          </Card>

          <Card id="politicas" className="scroll-mt-24">
            <CardHeader
              title="Políticas"
              description="Cancelamento, termos de compra e privacidade. Publicadas no site e aceitas pelo cliente na compra."
            />
            <CardContent>
              <PoliciesForm initial={politicas} canManage={podeGerenciar} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
