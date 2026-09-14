import { ChevronRight, Ticket } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { NoPermission } from '@/components/admin/no-permission';
import { SalesLink } from '@/components/admin/sales-link';
import { ReorderButtons } from '@/components/admin/tickets/reorder-buttons';
import { TicketTypeFormDialog } from '@/components/admin/tickets/ticket-type-form-dialog';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { HOLDER_DATA_LABELS, SALES_CHANNEL_LABELS, TICKET_CATEGORY_LABELS } from '@/lib/catalog';
import { plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { listTicketTypesAdmin, type AdminTicketType } from '@/server/catalog/service';
import { env } from '@/server/env';

export const metadata: Metadata = { title: 'Tipos de ingresso' };

function faixaEtaria(tipo: Pick<AdminTicketType, 'minAge' | 'maxAge'>): string {
  if (tipo.minAge !== null && tipo.maxAge !== null) return `${tipo.minAge} a ${tipo.maxAge} anos`;
  if (tipo.maxAge !== null) return `Até ${tipo.maxAge} anos`;
  if (tipo.minAge !== null) return `A partir de ${tipo.minAge} anos`;
  return 'Qualquer idade';
}

function resumoDosPrecos(tipo: AdminTicketType): string {
  const partes = [`Semana ${formatBRL(tipo.basePriceCents)}`];
  if (tipo.simplePricing.weekendPriceCents !== null) {
    partes.push(`fim de semana ${formatBRL(tipo.simplePricing.weekendPriceCents)}`);
  }
  if (tipo.simplePricing.holidayPriceCents !== null) {
    partes.push(`feriado ${formatBRL(tipo.simplePricing.holidayPriceCents)}`);
  }
  if (tipo.simplePricing.promo) partes.push(`promoção ${formatBRL(tipo.simplePricing.promo.priceCents)}`);
  return partes.join(' · ');
}

export default async function TiposDeIngressoPage() {
  const auth = await requirePageAuth();
  if (!can(auth, 'ticket_types.view')) return <NoPermission />;

  const tipos = await listTicketTypesAdmin(auth);
  const podeCriar = can(auth, 'ticket_types.manage');
  const podeOrdenar = can(auth, 'ticket_types.manage');
  const paginaDeCompra = `${env().APP_URL}/comprar`;
  const ativosNoSite = tipos.filter((tipo) => tipo.isActive && tipo.channels.includes('ONLINE'));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Tipos de ingresso"
        description="Tipos de ingresso vendidos no site e na bilheteria, preço de cada um e o link da página de compra."
        actions={podeCriar ? <TicketTypeFormDialog /> : null}
      />

      <Card>
        <CardHeader
          title="Página de compra"
          description={
            ativosNoSite.length > 0
              ? `O cliente escolhe a data, os ingressos e paga com PIX. ${plural(ativosNoSite.length, 'ingresso ativo', 'ingressos ativos')} no site.`
              : 'Nenhum ingresso ativo no site: a página abre, mas não há o que comprar.'
          }
        />
        <CardContent className="grid gap-5">
          <SalesLink url={paginaDeCompra} />
        </CardContent>
      </Card>

      {tipos.length === 0 ? (
        <Card>
          <EmptyState
            icon={Ticket}
            title="Nenhum tipo de ingresso"
            description="Crie os ingressos que o parque vende, por exemplo Adulto, Infantil, Meia-entrada e Criança de colo."
            action={podeCriar ? <TicketTypeFormDialog /> : null}
          />
        </Card>
      ) : (
        <section aria-labelledby="tipos-de-ingresso" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="tipos-de-ingresso" className="font-display text-[17px] font-semibold text-ink-900">
              Tipos de ingresso
            </h2>
            <p className="text-[13px] text-ink-500">Na ordem em que aparecem para o cliente</p>
          </div>
          <ul className="grid gap-3">
            {tipos.map((tipo, indice) => (
              <li key={tipo.id} className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-200/70">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/tipos-de-ingresso/${tipo.id}`}
                        className="font-display text-lg font-semibold text-ink-900 hover:text-pool-800"
                      >
                        {tipo.name}
                      </Link>
                      <Badge tone="info">{TICKET_CATEGORY_LABELS[tipo.category]}</Badge>
                      {tipo.isActive ? null : <Badge tone="neutral">Inativo</Badge>}
                      {tipo.peoplePerTicket > 1 ? (
                        <Badge tone="grape">{tipo.peoplePerTicket} pessoas</Badge>
                      ) : null}
                    </div>
                    {tipo.description ? (
                      <p className="mt-1 text-sm text-ink-600">{tipo.description}</p>
                    ) : null}
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-500">
                      <span>{tipo.channels.map((canal) => SALES_CHANNEL_LABELS[canal]).join(' e ')}</span>
                      <span>{faixaEtaria(tipo)}</span>
                      <span>Pede: {HOLDER_DATA_LABELS[tipo.holderData].toLowerCase()}</span>
                      {tipo.dailyQuota !== null ? <span>Até {tipo.dailyQuota} por dia</span> : null}
                      {tipo.occupiesCapacity ? null : <span>Não ocupa vaga</span>}
                    </p>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <p className="text-xs font-semibold text-ink-500">Preço para hoje</p>
                    <p className="tabular font-display text-2xl font-semibold text-ink-900">
                      {tipo.todayPrice.priceCents === 0 ? 'Gratuito' : formatBRL(tipo.todayPrice.priceCents)}
                    </p>
                    {tipo.todayPrice.compareAtCents ? (
                      <p className="tabular text-xs text-ink-400 line-through">
                        {formatBRL(tipo.todayPrice.compareAtCents)}
                      </p>
                    ) : null}
                    <p className="text-xs text-ink-500">{tipo.todayPrice.label ?? 'Preço base'}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
                  <p className="text-[13px] text-ink-600">
                    {plural(tipo.soldUnits, 'vendido', 'vendidos')} · {resumoDosPrecos(tipo)}
                  </p>
                  <div className="flex items-center gap-2">
                    {podeOrdenar && tipos.length > 1 ? (
                      <ReorderButtons
                        ticketTypeId={tipo.id}
                        name={tipo.name}
                        first={indice === 0}
                        last={indice === tipos.length - 1}
                      />
                    ) : null}
                    <Link
                      href={`/admin/tipos-de-ingresso/${tipo.id}`}
                      className={buttonClasses('secondary', 'sm')}
                    >
                      Preços e detalhes
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
