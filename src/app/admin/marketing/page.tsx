import { CreditCard, Eye, Megaphone, MousePointerClick, ShoppingCart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { KpiCard } from '@/components/admin/kpi-card';
import { MarketingSettingsForm } from '@/components/admin/marketing/marketing-settings-form';
import { NoPermission } from '@/components/admin/no-permission';
import { PeriodFilter } from '@/components/admin/period-filter';
import { CampaignLinkBuilder } from '@/components/admin/tickets/campaign-link-builder';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, todayIn } from '@/lib/dates';
import { formatNumber, formatPercent } from '@/lib/format';
import { TRACKING_EVENT_LABELS } from '@/lib/marketing';
import { formatBRL } from '@/lib/money';
import { ORIGIN_LABELS } from '@/lib/origins';
import { parsePeriod, type ParsedPeriod } from '@/lib/periods';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { env } from '@/server/env';
import type { SearchParamsRecord } from '@/server/filters';
import { getMarketingOverview } from '@/server/marketing/service';
import { getMarketingSettings } from '@/server/settings/service';

export const metadata: Metadata = { title: 'Marketing' };

const LINK = 'text-sm font-semibold text-pool-700 hover:text-pool-800';

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function consultaDoPeriodo(periodo: ParsedPeriod): string {
  return periodo.key === 'personalizado'
    ? `periodo=personalizado&de=${periodo.range.from}&ate=${periodo.range.to}`
    : `periodo=${periodo.key}`;
}

function taxa(parte: number, todo: number): string {
  return todo > 0 ? formatPercent(parte / todo) : '-';
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const auth = await requirePageAuth();
  if (!can(auth, 'marketing.view')) return <NoPermission />;

  const parametros = await searchParams;
  const periodo = parsePeriod(
    { periodo: primeiro(parametros.periodo), de: primeiro(parametros.de), ate: primeiro(parametros.ate) },
    todayIn(auth.park.timezone),
    'mes',
  );
  const [painel, pixels, tiposNoSite] = await Promise.all([
    getMarketingOverview(auth, periodo),
    getMarketingSettings(auth.park.id),
    prisma.ticketType.findMany({
      where: { parkId: auth.park.id, isActive: true, channels: { has: 'ONLINE' } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true },
    }),
  ]);
  const { funnel, changes } = painel;
  const valores = painel.showValues;
  const intervalo =
    periodo.range.from === periodo.range.to
      ? formatDateBR(periodo.range.from)
      : `${formatDateBR(periodo.range.from)} a ${formatDateBR(periodo.range.to)}`;
  const pixelsAtivos = [
    pixels.metaPixelId,
    pixels.tiktokPixelId,
    pixels.googleAnalyticsId,
    pixels.googleAdsId,
  ].filter(Boolean).length;
  const semEventos = funnel.views + funnel.checkouts + funnel.payments + funnel.purchases === 0;
  const maiorEtapa = Math.max(funnel.views, funnel.checkouts, funnel.payments, funnel.purchases, 1);
  const totalDeVendas = painel.sales.reduce((soma, linha) => soma + linha.orders, 0);
  const detalheDaCompra =
    funnel.payments > 0
      ? `${taxa(funnel.purchases, funnel.payments)} dos pagamentos iniciados`
      : 'sem pagamento iniciado no período';
  const etapas = [
    { chave: 'VIEW_TICKETS', valor: funnel.views, base: null },
    { chave: 'CHECKOUT_STARTED', valor: funnel.checkouts, base: funnel.views },
    { chave: 'PAYMENT_STARTED', valor: funnel.payments, base: funnel.checkouts },
    { chave: 'PURCHASE', valor: funnel.purchases, base: funnel.payments },
  ] as const;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Marketing / Rastreamento"
        description={`Funil de compra do site, origem das vendas, campanhas e pixels de anúncio. Período: ${intervalo}.`}
      />
      <PeriodFilter basePath="/admin/marketing" period={periodo} />

      <section
        aria-label="Funil de compra"
        className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label={TRACKING_EVENT_LABELS.VIEW_TICKETS}
          value={formatNumber(funnel.views)}
          change={changes.views}
          hint="navegadores que abriram a página de compra"
          icon={Eye}
        />
        <KpiCard
          label={TRACKING_EVENT_LABELS.CHECKOUT_STARTED}
          value={formatNumber(funnel.checkouts)}
          change={changes.checkouts}
          hint={
            funnel.views > 0
              ? `${taxa(funnel.checkouts, funnel.views)} de quem viu os ingressos`
              : 'sem visualizações no período'
          }
          icon={MousePointerClick}
          tone="grape"
        />
        <KpiCard
          label={TRACKING_EVENT_LABELS.PAYMENT_STARTED}
          value={formatNumber(funnel.payments)}
          change={changes.payments}
          hint={
            funnel.checkouts > 0
              ? `${taxa(funnel.payments, funnel.checkouts)} de quem começou o checkout`
              : 'sem checkout iniciado no período'
          }
          icon={CreditCard}
          tone="sun"
        />
        <KpiCard
          label={TRACKING_EVENT_LABELS.PURCHASE}
          value={formatNumber(funnel.purchases)}
          change={changes.purchases}
          hint={valores ? `${formatBRL(funnel.purchaseValueCents)} · ${detalheDaCompra}` : detalheDaCompra}
          icon={ShoppingCart}
          tone="citrus"
        />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader
            title="Funil do site"
            description={
              semEventos
                ? undefined
                : `${taxa(funnel.purchases, funnel.views)} de quem viu os ingressos concluiu a compra.`
            }
          />
          <CardContent className="pt-3">
            {semEventos ? (
              <EmptyState
                icon={Megaphone}
                title="Nenhuma visita no período"
                description="Os passos aparecem assim que alguém abre a página de compra do site."
              />
            ) : (
              <ol className="grid gap-4">
                {etapas.map((etapa) => (
                  <li key={etapa.chave}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-ink-800">{TRACKING_EVENT_LABELS[etapa.chave]}</span>
                      <span className="tabular text-ink-900">
                        {formatNumber(etapa.valor)}
                        {etapa.base ? (
                          <span className="ml-1.5 text-ink-500">({taxa(etapa.valor, etapa.base)})</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-pool-600"
                        style={{ width: `${Math.round((etapa.valor / maiorEtapa) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Origem das visitas"
            description="De onde vieram os visitantes do site e quantos compraram."
          />
          <CardContent className="pt-3">
            {painel.byOrigin.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">Nenhuma visita no período.</p>
            ) : (
              <TableContainer className="shadow-none">
                <Table>
                  <THead>
                    <tr>
                      <TH>Origem</TH>
                      <TH className="text-right">Visualizações</TH>
                      <TH className="text-right">Checkout</TH>
                      <TH className="text-right">Compras</TH>
                      <TH className="text-right">Conversão</TH>
                      {valores ? <TH className="text-right">Valor</TH> : null}
                    </tr>
                  </THead>
                  <TBody>
                    {painel.byOrigin.map((linha) => (
                      <TR key={linha.origin}>
                        <TD className="font-medium text-ink-900">{ORIGIN_LABELS[linha.origin]}</TD>
                        <TD className="tabular text-right">{formatNumber(linha.views)}</TD>
                        <TD className="tabular text-right">{formatNumber(linha.checkouts)}</TD>
                        <TD className="tabular text-right">{formatNumber(linha.purchases)}</TD>
                        <TD className="tabular text-right text-ink-600">
                          {linha.conversion === null ? '-' : formatPercent(linha.conversion)}
                        </TD>
                        {valores ? (
                          <TD className="tabular whitespace-nowrap text-right">
                            {formatBRL(linha.purchaseValueCents)}
                          </TD>
                        ) : null}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Campanhas"
            description="Links com utm_campaign: visitas, checkout e compras de cada campanha."
          />
          <CardContent className="pt-3">
            {painel.campaigns.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">
                Nenhuma campanha no período. Crie links de campanha no fim desta página.
              </p>
            ) : (
              <TableContainer className="shadow-none">
                <Table>
                  <THead>
                    <tr>
                      <TH>Campanha</TH>
                      <TH className="text-right">Visualizações</TH>
                      <TH className="text-right">Checkout</TH>
                      <TH className="text-right">Pagamentos</TH>
                      <TH className="text-right">Compras</TH>
                      <TH className="text-right">Conversão</TH>
                      {valores ? <TH className="text-right">Valor</TH> : null}
                    </tr>
                  </THead>
                  <TBody>
                    {painel.campaigns.map((linha) => (
                      <TR key={`${linha.campaign}-${linha.source ?? ''}-${linha.medium ?? ''}`}>
                        <TD>
                          <span className="font-medium text-ink-900">{linha.campaign}</span>
                          <span className="block text-xs text-ink-500">
                            {[linha.source, linha.medium].filter(Boolean).join(' / ') || 'sem origem'}
                          </span>
                        </TD>
                        <TD className="tabular text-right">{formatNumber(linha.views)}</TD>
                        <TD className="tabular text-right">{formatNumber(linha.checkouts)}</TD>
                        <TD className="tabular text-right">{formatNumber(linha.payments)}</TD>
                        <TD className="tabular text-right">{formatNumber(linha.purchases)}</TD>
                        <TD className="tabular text-right text-ink-600">
                          {linha.conversion === null ? '-' : formatPercent(linha.conversion)}
                        </TD>
                        {valores ? (
                          <TD className="tabular whitespace-nowrap text-right">
                            {formatBRL(linha.purchaseValueCents)}
                          </TD>
                        ) : null}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Vendas por origem"
            description="Vendas pagas no período, pela origem registrada no pedido."
            action={
              can(auth, 'reports.view') ? (
                <Link href={`/admin/relatorios/origem?${consultaDoPeriodo(periodo)}`} className={LINK}>
                  Relatório
                </Link>
              ) : null
            }
          />
          <CardContent className="pt-3">
            {painel.sales.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">Nenhuma venda paga no período.</p>
            ) : (
              <TableContainer className="shadow-none">
                <Table>
                  <THead>
                    <tr>
                      <TH>Origem</TH>
                      <TH className="text-right">Vendas</TH>
                      <TH className="text-right">Ingressos</TH>
                      {valores ? <TH className="text-right">Valor</TH> : null}
                      <TH className="text-right">Participação</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {painel.sales.map((linha) => (
                      <TR key={linha.origin}>
                        <TD className="font-medium text-ink-900">
                          {linha.origin === 'POS' ? 'Balcão' : ORIGIN_LABELS[linha.origin]}
                        </TD>
                        <TD className="tabular text-right">{formatNumber(linha.orders)}</TD>
                        <TD className="tabular text-right">{formatNumber(linha.tickets)}</TD>
                        {valores ? (
                          <TD className="tabular whitespace-nowrap text-right">
                            {formatBRL(linha.valueCents)}
                          </TD>
                        ) : null}
                        <TD className="tabular text-right text-ink-600">
                          {taxa(linha.orders, totalDeVendas)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Pixels e integrações"
          description={
            pixelsAtivos > 0
              ? `${pixelsAtivos} de 4 integrações ligadas. Eventos enviados: visualização dos ingressos, início do checkout, pagamento iniciado e compra realizada.`
              : 'Nenhum pixel ligado. O funil acima funciona mesmo sem pixel, com os dados do próprio sistema.'
          }
        />
        <CardContent className="pt-3">
          <MarketingSettingsForm values={pixels} canManage={can(auth, 'marketing.manage')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Criar link de campanha"
          description="Para anúncios, redes sociais e WhatsApp: cada link aparece separado no funil e nas vendas por origem."
        />
        <CardContent className="pt-3">
          <CampaignLinkBuilder baseUrl={`${env().APP_URL}/comprar`} ticketTypes={tiposNoSite} />
        </CardContent>
      </Card>
    </div>
  );
}
