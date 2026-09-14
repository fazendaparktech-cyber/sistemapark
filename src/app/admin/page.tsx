import {
  BadgePercent,
  CalendarDays,
  CircleDollarSign,
  DoorOpen,
  Percent,
  ReceiptText,
  Ticket,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { BarList } from '@/components/admin/bar-list';
import { ColumnChart } from '@/components/admin/charts/column-chart';
import { SalesChart } from '@/components/admin/charts/sales-chart';
import { KpiCard } from '@/components/admin/kpi-card';
import { PeriodFilter } from '@/components/admin/period-filter';
import { SalesLink } from '@/components/admin/sales-link';
import { ChannelBadge, OrderStatusBadge } from '@/components/admin/status-badges';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, formatDateTimeBR, todayIn, weekdayOf } from '@/lib/dates';
import { formatNumber, formatPercent, plural } from '@/lib/format';
import { greetingFor } from '@/lib/greeting';
import { formatBRL } from '@/lib/money';
import { ORDER_CHANNEL_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/orders';
import { parsePeriod } from '@/lib/periods';
import { DAY_KIND_LABELS } from '@/lib/pricing';
import { formatRelativeTime } from '@/lib/relative-time';
import { formatShortDate, WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getDashboard, type UpcomingDay } from '@/server/dashboard/metrics';
import { env } from '@/server/env';

export const metadata: Metadata = { title: 'Painel' };

type Parametros = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

const LINK = 'text-sm font-semibold text-pool-700 hover:text-pool-800';

function Ocupacao({ dia }: { dia: UpcomingDay }) {
  const aberto = dia.status === 'OPEN' && dia.capacity !== null && dia.capacity > 0;
  const capacidade = dia.capacity ?? 0;
  const vendidas = aberto ? Math.min(100, (dia.sold / capacidade) * 100) : 0;
  const reservadas = aberto ? Math.min(100 - vendidas, (dia.held / capacidade) * 100) : 0;
  const especial = dia.dayKind === 'HOLIDAY' || dia.dayKind === 'EVENT' || dia.dayKind === 'SPECIAL';

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 py-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_7rem]">
      <div className="leading-tight">
        <p className="text-[13px] font-semibold text-ink-900">
          {WEEKDAY_SHORT_LABELS[weekdayOf(dia.date)]} {formatShortDate(dia.date)}
        </p>
        {especial ? (
          <p className="truncate text-[11px] text-grape-700">{dia.label ?? DAY_KIND_LABELS[dia.dayKind]}</p>
        ) : null}
      </div>
      {aberto ? (
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full bg-pool-500" style={{ width: `${vendidas}%` }} />
            <div className="h-full bg-sun-300" style={{ width: `${reservadas}%` }} />
          </div>
          <p className="tabular mt-1 text-xs text-ink-500 sm:hidden">
            {formatNumber(dia.sold)} de {formatNumber(capacidade)} vendidos
          </p>
        </div>
      ) : (
        <p className="text-xs text-ink-400">{dia.status === 'CLOSED' ? 'Fechado' : 'Não configurado'}</p>
      )}
      <p className="tabular hidden text-right text-xs text-ink-600 sm:block">
        {aberto ? `${formatNumber(dia.sold)} / ${formatNumber(capacidade)}` : ''}
      </p>
    </li>
  );
}

export default async function PainelPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const auth = await requirePageAuth();
  const agora = new Date();
  const primeiroNome = auth.user.name.trim().split(/\s+/)[0] ?? auth.user.name;
  const saudacao = `${greetingFor(auth.park.timezone, agora)}, ${primeiroNome}`;

  if (!can(auth, 'dashboard.view')) {
    return (
      <PageHeader
        eyebrow={auth.park.name}
        title={saudacao}
        description="O painel de vendas não faz parte do seu acesso. Use o menu para abrir as áreas liberadas para você."
      />
    );
  }

  const parametros = await searchParams;
  const periodo = parsePeriod(
    { periodo: primeiro(parametros.periodo), de: primeiro(parametros.de), ate: primeiro(parametros.ate) },
    todayIn(auth.park.timezone),
    '30d',
  );
  const painel = await getDashboard(auth, periodo);
  const { kpis, today: hoje } = painel;
  const financeiro = painel.showFinancial;
  const intervalo =
    periodo.range.from === periodo.range.to
      ? formatDateBR(periodo.range.from)
      : `${formatDateBR(periodo.range.from)} a ${formatDateBR(periodo.range.to)}`;
  const semVendas = kpis.orders.value === 0;
  const totalDeIngressosPorTipo = painel.byTicketType.reduce((soma, tipo) => soma + tipo.tickets, 0);

  return (
    <div className="grid gap-6 lg:gap-8">
      <PageHeader
        eyebrow={auth.park.name}
        title={saudacao}
        description={`Vendas confirmadas de ${intervalo}, comparadas com o período anterior de mesmo tamanho.`}
      />
      <PeriodFilter basePath="/admin" period={periodo} />

      {painel.refundsDue.orders > 0 ? (
        <Alert tone="warning" title="Pagamentos a devolver">
          {plural(painel.refundsDue.orders, 'pedido foi pago', 'pedidos foram pagos')} sem ingresso liberado
          (pagamento fora do prazo sem vaga ou depois de cancelado)
          {painel.refundsDue.amountCents !== null
            ? `, somando ${formatBRL(painel.refundsDue.amountCents)}`
            : ''}
          .{' '}
          <Link href="/admin/vendas?financeiro=PAID&situacao=CANCELLED" className="font-semibold underline">
            Ver pedidos
          </Link>
        </Alert>
      ) : null}

      <section
        aria-label="Indicadores do período"
        className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4"
      >
        {kpis.revenue ? (
          <KpiCard
            label="Receita"
            value={formatBRL(kpis.revenue.value)}
            change={kpis.revenue.change}
            hint={`antes ${formatBRL(kpis.revenue.previous)}`}
            icon={CircleDollarSign}
          />
        ) : null}
        <KpiCard
          label="Pedidos pagos"
          value={formatNumber(kpis.orders.value)}
          change={kpis.orders.change}
          hint={`antes ${formatNumber(kpis.orders.previous)}`}
          icon={ReceiptText}
          tone="grape"
        />
        <KpiCard
          label="Ingressos vendidos"
          value={formatNumber(kpis.tickets.value)}
          change={kpis.tickets.change}
          hint={`antes ${formatNumber(kpis.tickets.previous)}`}
          icon={Ticket}
          tone="sun"
        />
        {kpis.averageOrder ? (
          <KpiCard
            label="Valor médio do pedido"
            value={formatBRL(kpis.averageOrder.value)}
            change={kpis.averageOrder.change}
            hint={`antes ${formatBRL(kpis.averageOrder.previous)}`}
            icon={Wallet}
            tone="citrus"
          />
        ) : null}
        <KpiCard
          label="Clientes novos"
          value={formatNumber(kpis.newCustomers.value)}
          change={kpis.newCustomers.change}
          hint="primeira compra no período"
          icon={UserCheck}
          tone="pool"
        />
        <KpiCard
          label="Conversão do site"
          value={formatPercent(kpis.conversion.value)}
          change={kpis.conversion.change}
          changeKind="points"
          hint="pedidos criados que foram pagos"
          icon={Percent}
          tone="grape"
        />
        <KpiCard
          label="Entradas na portaria"
          value={formatNumber(kpis.checkins.value)}
          change={kpis.checkins.change}
          hint={`antes ${formatNumber(kpis.checkins.previous)}`}
          icon={DoorOpen}
          tone="ink"
        />
        {kpis.discounts ? (
          <KpiCard
            label="Descontos concedidos"
            value={formatBRL(kpis.discounts.value)}
            change={kpis.discounts.change}
            inverse
            hint="em cupons"
            icon={BadgePercent}
            tone="sun"
          />
        ) : null}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Vendas no período" description={intervalo} />
          <CardContent>
            <SalesChart points={painel.series} showRevenue={financeiro} />
            {semVendas ? (
              <p className="mt-3 text-center text-sm text-ink-500">Nenhuma venda confirmada neste período.</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader
              title="Hoje no parque"
              description={
                hoje.status === 'OPEN'
                  ? hoje.opensAt && hoje.closesAt
                    ? `Aberto das ${hoje.opensAt} às ${hoje.closesAt}`
                    : 'Aberto'
                  : hoje.status === 'CLOSED'
                    ? 'Fechado hoje'
                    : 'Hoje não está configurado no calendário'
              }
              action={
                can(auth, 'calendar.view') ? (
                  <Link href="/admin/calendario" className={LINK}>
                    Calendário
                  </Link>
                ) : null
              }
            />
            <CardContent>
              {hoje.status === 'OPEN' ? (
                <div className="grid gap-4">
                  <dl className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { rotulo: 'Esperados', valor: hoje.expected },
                      { rotulo: 'Já entraram', valor: hoje.checkedIn },
                      { rotulo: 'Vagas livres', valor: hoje.available ?? 0 },
                    ].map((item) => (
                      <div
                        key={item.rotulo}
                        className="rounded-xl bg-ink-50 px-2 py-3 ring-1 ring-inset ring-ink-200/70"
                      >
                        <dt className="text-xs font-semibold text-ink-500">{item.rotulo}</dt>
                        <dd className="tabular mt-1 font-display text-2xl font-semibold text-ink-900">
                          {formatNumber(item.valor)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div>
                    <div className="flex justify-between text-xs text-ink-500">
                      <span>Entradas</span>
                      <span className="tabular">
                        {hoje.expected > 0 ? formatPercent(hoje.checkedIn / hoje.expected) : '0%'}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-citrus-500"
                        style={{
                          width: `${hoje.expected > 0 ? Math.min(100, (hoje.checkedIn / hoje.expected) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-[13px] leading-5 text-ink-500">
                    Lotação de {formatNumber(hoje.capacity ?? 0)} pessoas
                    {hoje.held > 0 ? `; ${formatNumber(hoje.held)} em compras ainda não pagas` : ''}.
                  </p>
                </div>
              ) : (
                <p className="text-sm leading-6 text-ink-600">
                  {hoje.status === 'CLOSED'
                    ? 'O parque não abre hoje. As vendas continuam para as próximas datas abertas.'
                    : 'Configure o dia de hoje no calendário para vender e receber visitantes.'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Pedidos aguardando pagamento" />
            <CardContent className="flex items-end justify-between gap-3 pt-3">
              <div>
                <p className="tabular font-display text-3xl font-semibold text-ink-900">
                  {formatNumber(painel.pending.orders)}
                </p>
                <p className="mt-1 text-[13px] text-ink-500">
                  {painel.pending.amountCents !== null && painel.pending.orders > 0
                    ? `${formatBRL(painel.pending.amountCents)} em PIX dentro do prazo`
                    : 'PIX gerados e ainda no prazo de pagamento'}
                </p>
              </div>
              {can(auth, 'orders.view') && painel.pending.orders > 0 ? (
                <Link href="/admin/vendas?situacao=PENDING" className={LINK}>
                  Ver pedidos
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Ingressos por tipo"
            description={`${plural(totalDeIngressosPorTipo, 'ingresso', 'ingressos')} no período`}
          />
          <CardContent>
            <BarList
              emptyText="Nenhum ingresso vendido no período."
              items={painel.byTicketType.map((tipo) => ({
                key: tipo.name,
                label: tipo.name,
                value: financeiro ? tipo.revenueCents : tipo.tickets,
                valueLabel: financeiro ? formatBRL(tipo.revenueCents) : formatNumber(tipo.tickets),
                detail: financeiro ? plural(tipo.tickets, 'ingresso', 'ingressos') : undefined,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Canais de venda" description="Pedidos pagos por canal" />
          <CardContent>
            <BarList
              tone="grape"
              emptyText="Nenhum pedido pago no período."
              items={painel.byChannel.map((canal) => ({
                key: canal.channel,
                label: ORDER_CHANNEL_LABELS[canal.channel],
                value: canal.orders,
                valueLabel: plural(canal.orders, 'pedido', 'pedidos'),
                detail: financeiro ? formatBRL(canal.revenueCents) : undefined,
              }))}
            />
          </CardContent>
        </Card>
        {financeiro ? (
          <Card>
            <CardHeader title="Formas de pagamento" description="Valor recebido, já sem reembolsos" />
            <CardContent>
              <BarList
                tone="citrus"
                emptyText="Nenhum pagamento aprovado no período."
                items={painel.byPaymentMethod.map((metodo) => ({
                  key: metodo.method,
                  label: PAYMENT_METHOD_LABELS[metodo.method],
                  value: metodo.amountCents,
                  valueLabel: formatBRL(metodo.amountCents),
                  detail: plural(metodo.payments, 'pagamento', 'pagamentos'),
                }))}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Origem das vendas" description="Pedidos pagos no site por origem" />
            <CardContent>
              <BarList
                tone="sun"
                emptyText="Nenhum pedido pago no site no período."
                items={(painel.topSources ?? []).map((origem) => ({
                  key: origem.source,
                  label: origem.source,
                  value: origem.orders,
                  valueLabel: plural(origem.orders, 'pedido', 'pedidos'),
                }))}
              />
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Horário das compras"
            description="Pedidos pagos por hora em que a compra começou"
          />
          <CardContent>
            <ColumnChart
              singular="pedido"
              plural="pedidos"
              data={painel.byHour.map((hora) => ({ label: `${hora.hour}h`, value: hora.orders }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Dias de visita mais procurados"
            description="Ingressos vendidos no período, pelo dia da visita"
          />
          <CardContent>
            <ColumnChart
              singular="ingresso"
              plural="ingressos"
              color="#22aac3"
              data={painel.byWeekday.map((dia) => ({
                label: WEEKDAY_SHORT_LABELS[dia.weekday] ?? '',
                value: dia.tickets,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Ocupação dos próximos 14 dias"
            description="Vendidos e reservados em relação à lotação"
            action={
              can(auth, 'calendar.view') ? (
                <Link href="/admin/calendario" className={LINK}>
                  Abrir calendário
                </Link>
              ) : null
            }
          />
          <CardContent className="pt-3">
            <div className="mb-2 flex gap-4 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full bg-pool-500" /> Vendidos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full bg-sun-300" /> Aguardando pagamento
              </span>
            </div>
            <ul className="divide-y divide-ink-100">
              {painel.upcoming.map((dia) => (
                <Ocupacao key={dia.date} dia={dia} />
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {can(auth, 'ticket_types.view') ? (
            <Card>
              <CardHeader
                title="Página de vendas"
                description="Link que o cliente usa para escolher a data e comprar. Divulgue nas redes, no WhatsApp e no site."
              />
              <CardContent className="grid gap-3">
                <SalesLink url={`${env().APP_URL}/comprar`} />
                <Link href="/admin/ingressos" className={cn(LINK, 'w-fit')}>
                  Links por ingresso e campanha
                </Link>
              </CardContent>
            </Card>
          ) : null}

          {painel.showMarketing ? (
            <Card>
              <CardHeader
                title="Cupons mais usados"
                action={
                  can(auth, 'coupons.view') ? (
                    <Link href="/admin/cupons" className={LINK}>
                      Ver cupons
                    </Link>
                  ) : null
                }
              />
              <CardContent className="pt-3">
                {painel.topCoupons && painel.topCoupons.length > 0 ? (
                  <ul className="divide-y divide-ink-100">
                    {painel.topCoupons.map((cupom) => (
                      <li key={cupom.code} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold text-ink-900">{cupom.code}</p>
                          <p className="text-xs text-ink-500">{plural(cupom.uses, 'uso', 'usos')}</p>
                        </div>
                        {financeiro ? (
                          <div className="text-right text-xs text-ink-500">
                            <p className="tabular text-sm font-semibold text-ink-900">
                              {formatBRL(cupom.revenueCents)}
                            </p>
                            <p className="tabular">{formatBRL(cupom.discountCents)} de desconto</p>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-ink-500">Nenhum cupom usado no período.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {financeiro && painel.topSources ? (
            <Card>
              <CardHeader
                title="Origem das vendas"
                description="Pedidos pagos no site, pela campanha (utm_source)"
              />
              <CardContent>
                <BarList
                  tone="sun"
                  emptyText="Nenhum pedido pago no site no período."
                  items={painel.topSources.map((origem) => ({
                    key: origem.source,
                    label: origem.source,
                    value: origem.orders,
                    valueLabel: plural(origem.orders, 'pedido', 'pedidos'),
                    detail: formatBRL(origem.revenueCents),
                  }))}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {painel.recentOrders ? (
        <section className="grid gap-3" aria-labelledby="ultimos-pedidos">
          <div className="flex items-center justify-between gap-3">
            <h2 id="ultimos-pedidos" className="font-display text-[17px] font-semibold text-ink-900">
              Últimos pedidos
            </h2>
            <Link href="/admin/vendas" className={LINK}>
              Ver todos
            </Link>
          </div>
          {painel.recentOrders.length === 0 ? (
            <Card>
              <p className="px-6 py-10 text-center text-sm text-ink-500">Nenhum pedido ainda.</p>
            </Card>
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Pedido</TH>
                    <TH>Comprador</TH>
                    <TH>Canal</TH>
                    <TH className="text-right">Ingressos</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Situação</TH>
                  </tr>
                </THead>
                <TBody>
                  {painel.recentOrders.map((pedido) => (
                    <TR key={pedido.id} className="hover:bg-pool-50/40">
                      <TD className="whitespace-nowrap">
                        <Link
                          href={`/admin/vendas/${pedido.id}`}
                          className="font-mono text-[13px] font-semibold text-ink-900 hover:text-pool-800"
                        >
                          {pedido.code}
                        </Link>
                        <p
                          className="text-xs text-ink-500"
                          title={formatDateTimeBR(pedido.createdAt, auth.park.timezone)}
                        >
                          {formatRelativeTime(pedido.createdAt, agora)}
                        </p>
                      </TD>
                      <TD className="max-w-48 truncate">{pedido.buyerName}</TD>
                      <TD>
                        <ChannelBadge channel={pedido.channel} />
                      </TD>
                      <TD className="tabular text-right">{formatNumber(pedido.ticketsCount)}</TD>
                      <TD className="tabular whitespace-nowrap text-right font-semibold">
                        {formatBRL(pedido.totalCents)}
                      </TD>
                      <TD>
                        <OrderStatusBadge status={pedido.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </section>
      ) : null}

      {can(auth, 'calendar.view') ? null : (
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <CalendarDays className="size-3.5" aria-hidden /> Ocupação calculada pelo calendário do parque.
        </p>
      )}
    </div>
  );
}
