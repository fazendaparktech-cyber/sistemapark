import {
  BadgePercent,
  CalendarRange,
  CircleDashed,
  CircleDollarSign,
  Clock,
  DoorOpen,
  Gauge,
  Globe,
  ReceiptText,
  Store,
  Ticket,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  UserX,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BarList } from '@/components/admin/bar-list';
import { SalesChart } from '@/components/admin/charts/sales-chart';
import { VisitorsChart } from '@/components/admin/charts/visitors-chart';
import { KpiCard } from '@/components/admin/kpi-card';
import { KpiGrid } from '@/components/admin/kpi-grid';
import { firstAllowedHref } from '@/components/admin/nav';
import { PeriodFilter } from '@/components/admin/period-filter';
import { SalesLink } from '@/components/admin/sales-link';
import { ChannelBadge, SaleStatusBadge } from '@/components/admin/status-badges';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, formatDateTimeBR, todayIn, weekdayOf } from '@/lib/dates';
import { formatNumber, formatPercent, plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { ORDER_CHANNEL_LABELS, PAYMENT_GROUP_LABELS } from '@/lib/orders';
import { ORIGIN_LABELS } from '@/lib/origins';
import { parsePeriod } from '@/lib/periods';
import { DAY_KIND_LABELS } from '@/lib/pricing';
import { formatRelativeTime } from '@/lib/relative-time';
import { formatShortDate, WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getDashboard, type UpcomingDay } from '@/server/dashboard/metrics';
import { env } from '@/server/env';

export const metadata: Metadata = { title: 'Dashboard' };

type Parametros = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

const LINK = 'text-sm font-semibold text-pool-700 hover:text-pool-800';
const COMPARADO = 'comparado ao período anterior';

function Ocupacao({ dia }: { dia: UpcomingDay }) {
  const aberto = dia.status === 'OPEN' && dia.capacity !== null && dia.capacity > 0;
  const capacidade = dia.capacity ?? 0;
  const vendidas = aberto ? Math.min(100, (dia.sold / capacidade) * 100) : 0;
  const reservadas = aberto ? Math.min(100 - vendidas, (dia.held / capacidade) * 100) : 0;
  const especial = dia.dayKind === 'HOLIDAY' || dia.dayKind === 'EVENT' || dia.dayKind === 'SPECIAL';

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 py-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_8rem]">
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
            {formatNumber(dia.sold)} de {formatNumber(capacidade)} · {formatPercent(dia.sold / capacidade)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-ink-400">{dia.status === 'CLOSED' ? 'Fechado' : 'Não configurado'}</p>
      )}
      <p className="tabular hidden text-right text-xs text-ink-600 sm:block">
        {aberto
          ? `${formatNumber(dia.sold)} / ${formatNumber(capacidade)} · ${formatPercent(dia.sold / capacidade)}`
          : ''}
      </p>
    </li>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const auth = await requirePageAuth();
  const agora = new Date();

  if (!can(auth, 'dashboard.view')) {
    // Quem não vê o dashboard (portaria, bilheteria) cai direto na primeira área liberada.
    const destino = firstAllowedHref(auth.permissions);
    if (destino && destino !== '/admin') redirect(destino);
    return (
      <PageHeader
        eyebrow={auth.park.name}
        title="Dashboard"
        description="Seu acesso ainda não inclui nenhuma área do painel. Fale com o administrador do parque."
      />
    );
  }

  const parametros = await searchParams;
  const periodo = parsePeriod(
    { periodo: primeiro(parametros.periodo), de: primeiro(parametros.de), ate: primeiro(parametros.ate) },
    todayIn(auth.park.timezone),
    'mes',
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
  const totalDeVendasPorCanal = painel.byChannel.reduce((soma, canal) => soma + canal.orders, 0);
  const aberto = hoje.status === 'OPEN';

  return (
    <div className="grid gap-6 lg:gap-8">
      <PageHeader
        eyebrow={auth.park.name}
        title="Dashboard"
        description="Vendas, faturamento, visitantes e ocupação do parque."
      />

      {painel.refundsDue.orders > 0 ? (
        <Alert tone="warning" title="Pagamentos a devolver">
          {plural(painel.refundsDue.orders, 'venda foi paga', 'vendas foram pagas')} sem ingresso liberado
          (pagamento fora do prazo sem vaga ou depois de cancelada)
          {painel.refundsDue.amountCents !== null
            ? `, somando ${formatBRL(painel.refundsDue.amountCents)}`
            : ''}
          .{' '}
          <Link href="/admin/vendas?financeiro=PAID&situacao=CANCELLED" className="font-semibold underline">
            Ver vendas
          </Link>
        </Alert>
      ) : null}

      <section aria-labelledby="hoje-no-parque" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="hoje-no-parque" className="font-display text-[19px] font-semibold text-ink-900">
              Hoje no parque
            </h2>
            <p className="text-sm text-ink-500">
              {formatDateBR(hoje.date)} ·{' '}
              {aberto
                ? hoje.opensAt && hoje.closesAt
                  ? `aberto das ${hoje.opensAt} às ${hoje.closesAt}`
                  : 'aberto'
                : hoje.status === 'CLOSED'
                  ? 'fechado hoje'
                  : 'dia não configurado no calendário'}
              {hoje.label ? ` · ${hoje.label}` : ''}
            </p>
          </div>
          {can(auth, 'checkin.monitor') ? (
            <Link href="/admin/portaria" className={LINK}>
              Abrir portaria
            </Link>
          ) : null}
        </div>
        <KpiGrid>
          {hoje.revenue ? (
            <KpiCard
              label="Faturamento hoje"
              value={formatBRL(hoje.revenue.value)}
              change={hoje.revenue.change}
              hint="comparado a ontem"
              icon={CircleDollarSign}
            />
          ) : null}
          {hoje.monthRevenue ? (
            <KpiCard
              label="Faturamento do mês"
              value={formatBRL(hoje.monthRevenue.value)}
              change={hoje.monthRevenue.change}
              hint="comparado aos mesmos dias do mês anterior"
              icon={CalendarRange}
              tone="grape"
            />
          ) : null}
          <KpiCard
            label="Ingressos vendidos hoje"
            value={formatNumber(hoje.ticketsSold.value)}
            change={hoje.ticketsSold.change}
            hint="comparado a ontem"
            icon={Ticket}
            tone="sun"
          />
          <KpiCard
            label="Visitantes esperados hoje"
            value={formatNumber(hoje.expected)}
            hint="ingressos válidos para hoje"
            icon={Users}
            tone="citrus"
          />
          <KpiCard
            label="Check-ins hoje"
            value={formatNumber(hoje.checkedIn)}
            hint={
              hoje.attendance !== null
                ? `${formatPercent(hoje.attendance)} dos esperados`
                : 'nenhuma entrada ainda'
            }
            icon={DoorOpen}
            tone="pool"
          />
          <KpiCard
            label="Ainda não chegaram"
            value={formatNumber(hoje.notArrived)}
            hint="com ingresso para hoje"
            icon={Clock}
            tone="ink"
          />
          <KpiCard
            label="Capacidade máxima"
            value={hoje.capacity !== null ? formatNumber(hoje.capacity) : aberto ? 'Livre' : 'Fechado'}
            hint="pessoas no dia"
            icon={UsersRound}
            tone="grape"
          />
          <KpiCard
            label="Capacidade disponível"
            value={hoje.available !== null ? formatNumber(hoje.available) : 'Sem venda'}
            hint={
              hoje.held > 0 ? `${formatNumber(hoje.held)} vagas em pagamento pendente` : 'vagas para vender'
            }
            icon={CircleDashed}
            tone="citrus"
          />
          <KpiCard
            label="Ocupação"
            value={hoje.occupancy !== null ? formatPercent(hoje.occupancy) : 'Sem capacidade'}
            hint={hoje.capacity !== null ? `${formatNumber(hoje.sold)} vendidos` : undefined}
            icon={Gauge}
            tone="sun"
          />
          <KpiCard
            label="Comparecimento hoje"
            value={hoje.attendance !== null ? formatPercent(hoje.attendance) : 'Sem ingressos'}
            hint="check-ins ÷ ingressos do dia"
            icon={UserCheck}
            tone="pool"
          />
        </KpiGrid>
      </section>

      <section aria-labelledby="periodo" className="grid gap-4">
        <div className="grid gap-3">
          <div>
            <h2 id="periodo" className="font-display text-[19px] font-semibold text-ink-900">
              Período: {intervalo}
            </h2>
            <p className="text-sm text-ink-500">
              Cada indicador é comparado ao período anterior de mesmo tamanho.
            </p>
          </div>
          <PeriodFilter basePath="/admin" period={periodo} />
        </div>
        <KpiGrid>
          {kpis.revenue ? (
            <KpiCard
              label="Faturamento"
              value={formatBRL(kpis.revenue.value)}
              change={kpis.revenue.change}
              hint={COMPARADO}
              icon={CircleDollarSign}
            />
          ) : null}
          <KpiCard
            label="Total de vendas"
            value={formatNumber(kpis.orders.value)}
            change={kpis.orders.change}
            hint={`${plural(kpis.tickets.value, 'ingresso', 'ingressos')} vendidos`}
            icon={ReceiptText}
            tone="grape"
          />
          {kpis.averageOrder ? (
            <KpiCard
              label="Ticket médio"
              value={formatBRL(kpis.averageOrder.value)}
              change={kpis.averageOrder.change}
              hint="faturamento ÷ vendas"
              icon={Wallet}
              tone="citrus"
            />
          ) : null}
          {kpis.averagePerVisitor ? (
            <KpiCard
              label="Valor médio por visitante"
              value={formatBRL(kpis.averagePerVisitor.value)}
              change={kpis.averagePerVisitor.change}
              hint="faturamento ÷ ingressos"
              icon={UserRound}
              tone="sun"
            />
          ) : null}
          <KpiCard
            label="Vendas online"
            value={formatNumber(kpis.onlineOrders.value)}
            change={kpis.onlineOrders.change}
            hint={kpis.onlineRevenue ? formatBRL(kpis.onlineRevenue.value) : COMPARADO}
            icon={Globe}
            tone="pool"
          />
          <KpiCard
            label="Vendas presenciais"
            value={formatNumber(kpis.posOrders.value)}
            change={kpis.posOrders.change}
            hint={kpis.posRevenue ? formatBRL(kpis.posRevenue.value) : COMPARADO}
            icon={Store}
            tone="grape"
          />
          {kpis.discounts ? (
            <KpiCard
              label="Desconto concedido"
              value={formatBRL(kpis.discounts.value)}
              change={kpis.discounts.change}
              inverse
              hint="cupons e descontos no balcão"
              icon={BadgePercent}
              tone="sun"
            />
          ) : null}
          <KpiCard
            label="Clientes novos"
            value={formatNumber(kpis.newCustomers.value)}
            change={kpis.newCustomers.change}
            hint={`${plural(kpis.returningCustomers.value, 'recorrente', 'recorrentes')} compraram de novo`}
            icon={UserPlus}
            tone="citrus"
          />
          <KpiCard
            label="Taxa de comparecimento"
            value={kpis.attendance ? formatPercent(kpis.attendance.value) : 'Sem dias encerrados'}
            change={kpis.attendance ? kpis.attendance.change : undefined}
            changeKind="points"
            hint="check-ins ÷ ingressos das datas já passadas"
            icon={UserCheck}
            tone="pool"
          />
          <KpiCard
            label="No-show"
            value={kpis.noShow ? formatNumber(kpis.noShow.value) : 'Sem dias encerrados'}
            change={kpis.noShow ? kpis.noShow.change : undefined}
            inverse
            hint="ingressos pagos que não entraram"
            icon={UserX}
            tone="ink"
          />
        </KpiGrid>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={financeiro ? 'Faturamento e ingressos por dia' : 'Vendas e ingressos por dia'}
            description={intervalo}
          />
          <CardContent>
            <SalesChart points={painel.series} showRevenue={financeiro} />
            {semVendas ? (
              <p className="mt-3 text-center text-sm text-ink-500">Nenhuma venda paga neste período.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Online x presencial" description="Vendas pagas no período" />
          <CardContent className="grid gap-5">
            {totalDeVendasPorCanal === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">Nenhuma venda paga no período.</p>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-full bg-ink-100">
                  {painel.byChannel.map((canal) => (
                    <div
                      key={canal.channel}
                      className={canal.channel === 'ONLINE' ? 'bg-pool-500' : 'bg-grape-500'}
                      style={{ width: `${(canal.orders / totalDeVendasPorCanal) * 100}%` }}
                    />
                  ))}
                </div>
                <ul className="grid gap-4">
                  {painel.byChannel.map((canal) => (
                    <li key={canal.channel} className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className={`mt-1.5 size-2.5 rounded-full ${canal.channel === 'ONLINE' ? 'bg-pool-500' : 'bg-grape-500'}`}
                        />
                        <div>
                          <p className="font-semibold text-ink-900">{ORDER_CHANNEL_LABELS[canal.channel]}</p>
                          <p className="text-[13px] text-ink-500">
                            {plural(canal.orders, 'venda', 'vendas')} ·{' '}
                            {plural(canal.tickets, 'ingresso', 'ingressos')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="tabular font-semibold text-ink-900">
                          {formatPercent(canal.orders / totalDeVendasPorCanal)}
                        </p>
                        {financeiro ? (
                          <p className="tabular text-[13px] text-ink-500">{formatBRL(canal.revenueCents)}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Visitantes por dia"
            description="Ingressos válidos para cada data de visita e entradas registradas"
          />
          <CardContent>
            <VisitorsChart points={painel.visitors} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Tipos mais vendidos"
            description={`${plural(totalDeIngressosPorTipo, 'ingresso', 'ingressos')} no período`}
          />
          <CardContent>
            <BarList
              emptyText="Nenhum ingresso vendido no período."
              items={painel.byTicketType.map((tipo) => ({
                key: tipo.name,
                label: tipo.name,
                value: tipo.tickets,
                valueLabel: plural(tipo.tickets, 'ingresso', 'ingressos'),
                detail: financeiro ? formatBRL(tipo.revenueCents) : undefined,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {financeiro ? (
          <Card>
            <CardHeader title="Formas de pagamento" description="Valor recebido, já sem reembolsos" />
            <CardContent>
              <BarList
                tone="citrus"
                emptyText="Nenhum pagamento recebido no período."
                items={painel.byPaymentGroup.map((grupo) => ({
                  key: grupo.group,
                  label: PAYMENT_GROUP_LABELS[grupo.group],
                  value: grupo.amountCents,
                  valueLabel: formatBRL(grupo.amountCents),
                  detail: plural(grupo.payments, 'pagamento', 'pagamentos'),
                }))}
              />
            </CardContent>
          </Card>
        ) : null}
        {painel.byOrigin ? (
          <Card>
            <CardHeader
              title="Vendas por origem"
              description="Vendas online pagas, pela campanha ou pelo site de onde o cliente veio"
              action={
                can(auth, 'marketing.view') ? (
                  <Link href="/admin/marketing" className={LINK}>
                    Funil e campanhas
                  </Link>
                ) : null
              }
            />
            <CardContent>
              <BarList
                tone="sun"
                emptyText="Nenhuma venda online paga no período."
                items={painel.byOrigin.map((origem) => ({
                  key: origem.origin,
                  label: ORIGIN_LABELS[origem.origin],
                  value: origem.orders,
                  valueLabel: plural(origem.orders, 'venda', 'vendas'),
                  detail: financeiro ? formatBRL(origem.revenueCents) : undefined,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}
        {painel.topCoupons ? (
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
              {painel.topCoupons.length > 0 ? (
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
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Ocupação dos próximos 14 dias"
            description="Vendidos e reservados em relação à capacidade"
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

        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Card>
            <CardHeader title="Vendas aguardando pagamento" />
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
                  Ver vendas
                </Link>
              ) : null}
            </CardContent>
          </Card>
          {can(auth, 'ticket_types.view') ? (
            <Card>
              <CardHeader
                title="Página de vendas"
                description="Link que o cliente usa para escolher a data e comprar. Divulgue nas redes, no WhatsApp e no site."
              />
              <CardContent>
                <SalesLink url={`${env().APP_URL}/comprar`} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {painel.recentOrders ? (
        <section className="grid gap-3" aria-labelledby="ultimas-vendas">
          <div className="flex items-center justify-between gap-3">
            <h2 id="ultimas-vendas" className="font-display text-[17px] font-semibold text-ink-900">
              Últimas vendas
            </h2>
            <Link href="/admin/vendas" className={LINK}>
              Ver todas
            </Link>
          </div>
          {painel.recentOrders.length === 0 ? (
            <Card>
              <p className="px-6 py-10 text-center text-sm text-ink-500">Nenhuma venda ainda.</p>
            </Card>
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Pedido</TH>
                    <TH>Cliente</TH>
                    <TH>Canal</TH>
                    <TH className="text-right">Ingressos</TH>
                    <TH className="text-right">Valor</TH>
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
                        <SaleStatusBadge status={pedido.saleStatus} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </section>
      ) : null}
    </div>
  );
}
