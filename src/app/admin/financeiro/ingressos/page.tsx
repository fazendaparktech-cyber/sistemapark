import {
  BadgePercent,
  CircleDollarSign,
  Hourglass,
  Percent,
  Receipt,
  ReceiptText,
  Tag,
  Ticket,
  Undo2,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FinanceChart, type FinanceChartPoint } from '@/components/admin/charts/finance-chart';
import { PieBreakdown } from '@/components/admin/charts/pie-breakdown';
import { BarList } from '@/components/admin/finance/bar-list';
import {
  FinanceHeader,
  financePeriod,
  periodLabel,
  periodQuery,
} from '@/components/admin/finance/finance-header';
import { KpiCard } from '@/components/admin/kpi-card';
import { KpiGrid } from '@/components/admin/kpi-grid';
import { NoPermission } from '@/components/admin/no-permission';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, formatDateTimeBR, todayIn, weekdayOf } from '@/lib/dates';
import { formatNumber, formatPercent, plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import {
  PAYMENT_GROUP_LABELS,
  PAYMENT_METHOD_LABELS,
  paymentGroupOf,
  type PaymentGroupKey,
} from '@/lib/orders';
import { WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import type { SearchParamsRecord } from '@/server/filters';
import { getFinanceSummary } from '@/server/finance/service';
import { getTicketSalesMetrics } from '@/server/finance/tickets';

export const metadata: Metadata = { title: 'Financeiro' };

const COMPARADO = 'comparado ao período anterior';
const SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;
const LINK = 'text-sm font-semibold text-pool-700 hover:text-pool-800';

export default async function FinanceiroIngressosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const auth = await requirePageAuth();
  if (!can(auth, 'finance.view')) return <NoPermission />;

  const periodo = financePeriod(await searchParams, auth.park.timezone);
  const [resumo, vendas] = await Promise.all([
    getFinanceSummary(auth, periodo),
    getTicketSalesMetrics(auth, periodo),
  ]);
  const fuso = auth.park.timezone;
  const consulta = periodQuery(periodo);
  const liquidoTotal = resumo.net.value;
  const diasComMovimento = resumo.daily
    .filter((dia) => dia.grossCents !== 0 || dia.refundsCents !== 0 || dia.paidOrders !== 0)
    .reverse();
  const totalDoPeriodo = resumo.daily.reduce(
    (soma, dia) => ({
      paidOrders: soma.paidOrders + dia.paidOrders,
      grossCents: soma.grossCents + dia.grossCents,
      refundsCents: soma.refundsCents + dia.refundsCents,
      feesCents: soma.feesCents + dia.feesCents,
      netCents: soma.netCents + dia.netCents,
    }),
    { paidOrders: 0, grossCents: 0, refundsCents: 0, feesCents: 0, netCents: 0 },
  );

  // Formas dentro do grupo (ex.: "Cartão de crédito, Maquininha"), sem repetir o nome do grupo.
  const formasDoGrupo = (grupo: PaymentGroupKey): string =>
    resumo.byMethod
      .filter((metodo) => paymentGroupOf(metodo.method) === grupo)
      .map((metodo) => PAYMENT_METHOD_LABELS[metodo.method])
      .filter((rotulo) => rotulo !== PAYMENT_GROUP_LABELS[grupo])
      .join(', ');

  const pontosDoGrafico: FinanceChartPoint[] = resumo.daily.map((dia) => ({
    key: dia.date,
    label: formatDateBR(dia.date).slice(0, 5),
    grossCents: dia.grossCents,
    refundsCents: dia.refundsCents,
    netCents: dia.netCents,
  }));
  const recebidoPorForma = resumo.byGroup
    .filter((grupo) => grupo.grossCents > 0)
    .sort((a, b) => b.grossCents - a.grossCents)
    .map((grupo) => ({
      key: grupo.group,
      label: PAYMENT_GROUP_LABELS[grupo.group],
      value: grupo.grossCents,
    }));
  // Valor bruto pelo dia em que o pagamento foi aprovado.
  const porDiaDaSemana = SEMANA.map((diaDaSemana) => {
    const dias = resumo.daily.filter((dia) => weekdayOf(dia.date) === diaDaSemana);
    const bruto = dias.reduce((soma, dia) => soma + dia.grossCents, 0);
    const comVenda = dias.filter((dia) => dia.grossCents > 0).length;
    return {
      key: String(diaDaSemana),
      label: WEEKDAY_SHORT_LABELS[diaDaSemana],
      valueCents: bruto,
      detail:
        comVenda > 0 ? `média de ${formatBRL(Math.round(bruto / comVenda))} por dia com venda` : 'sem vendas',
    };
  });

  const ticketMedio =
    resumo.paidOrders.value > 0 ? Math.round(resumo.paidAmount.value / resumo.paidOrders.value) : 0;
  const precoMedio =
    vendas.tickets.value > 0 ? Math.round(resumo.paidAmount.value / vendas.tickets.value) : 0;
  const taxaDeReembolso = resumo.gross.value > 0 ? resumo.refunds.value / resumo.gross.value : 0;

  return (
    <div className="grid gap-6">
      <FinanceHeader
        tab="ingressos"
        period={periodo}
        today={todayIn(fuso)}
        canManage={can(auth, 'finance.manage')}
        canExport={can(auth, 'reports.export')}
        description={`Venda de ingressos: receita, reembolsos, taxas e formas de pagamento de ${periodLabel(periodo)}.`}
      />

      <KpiGrid>
        <KpiCard
          label="Receita bruta"
          value={formatBRL(resumo.gross.value)}
          change={resumo.gross.change}
          hint={COMPARADO}
          icon={CircleDollarSign}
        />
        <KpiCard
          label="Receita líquida"
          value={formatBRL(resumo.net.value)}
          change={resumo.net.change}
          hint="bruta − reembolsos − taxas"
          icon={Wallet}
        />
        <KpiCard
          label="Vendas pagas"
          value={formatNumber(resumo.paidOrders.value)}
          change={resumo.paidOrders.change}
          hint={formatBRL(resumo.paidAmount.value)}
          icon={ReceiptText}
        />
        <KpiCard
          label="Ingressos vendidos"
          value={formatNumber(vendas.tickets.value)}
          change={vendas.tickets.change}
          hint={COMPARADO}
          icon={Ticket}
        />
        <KpiCard
          label="Ticket médio"
          value={formatBRL(ticketMedio)}
          hint="valor médio por venda"
          icon={Receipt}
        />
        <KpiCard
          label="Preço médio do ingresso"
          value={formatBRL(precoMedio)}
          hint="valor vendido ÷ ingressos"
          icon={Tag}
        />
        <KpiCard
          label="Reembolsos"
          value={formatBRL(resumo.refunds.value)}
          change={resumo.refunds.change}
          inverse
          hint={`${formatPercent(taxaDeReembolso)} da receita bruta`}
          icon={Undo2}
        />
        <KpiCard
          label="Taxas"
          value={formatBRL(resumo.fees.value)}
          change={resumo.fees.change}
          inverse
          hint="cobradas pelo provedor de pagamento"
          icon={Percent}
        />
        <KpiCard
          label="Descontos concedidos"
          value={formatBRL(resumo.discounts.value)}
          change={resumo.discounts.change}
          inverse
          hint="cupons e descontos no balcão"
          icon={BadgePercent}
        />
        <KpiCard
          label="Vendas pendentes"
          value={formatNumber(resumo.pending.orders)}
          hint={
            resumo.pending.orders > 0
              ? `${formatBRL(resumo.pending.amountCents)} aguardando pagamento agora`
              : 'nenhum PIX em aberto agora'
          }
          icon={Hourglass}
        />
      </KpiGrid>

      <Card>
        <CardHeader
          title="Receita por dia"
          description="Quanto entrou, quanto foi devolvido e o líquido de cada dia do período."
        />
        <CardContent className="pt-3">
          {diasComMovimento.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-500">Nenhum movimento no período.</p>
          ) : (
            <FinanceChart points={pontosDoGrafico} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Visitas futuras já pagas"
          description="Dinheiro já recebido de visitas de hoje em diante, independente do período escolhido."
        />
        <CardContent className="pt-3">
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { rotulo: 'Valor já recebido', valor: formatBRL(vendas.upcoming.amountCents) },
              { rotulo: 'Visitas nos próximos 7 dias', valor: formatBRL(vendas.upcoming.next7DaysCents) },
              { rotulo: 'Vendas', valor: formatNumber(vendas.upcoming.orders) },
              { rotulo: 'Ingressos', valor: formatNumber(vendas.upcoming.tickets) },
            ].map((item) => (
              <div
                key={item.rotulo}
                className="rounded-xl bg-ink-50 px-4 py-3 ring-1 ring-inset ring-ink-200/70"
              >
                <dt className="text-[13px] font-medium text-ink-600">{item.rotulo}</dt>
                <dd className="tabular mt-1 font-display text-xl font-semibold text-ink-900">{item.valor}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Por canal" description="Vendas pagas no período, pelo site e no balcão." />
          <CardContent className="pt-3">
            <BarList
              emptyText="Nenhuma venda no período."
              items={vendas.byChannel.map((canal) => ({
                key: canal.key,
                label: canal.label,
                valueCents: canal.amountCents,
                detail: `${plural(canal.orders, 'venda', 'vendas')} · ${plural(canal.tickets, 'ingresso', 'ingressos')}`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Recebido por forma de pagamento"
            description="Participação de cada forma no valor bruto do período."
          />
          <CardContent className="pt-3">
            <PieBreakdown money slices={recebidoPorForma} emptyText="Nenhum pagamento no período." />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Por tipo de ingresso"
            description="Valor vendido e preço médio de cada tipo no período."
          />
          <CardContent className="pt-3">
            <BarList
              emptyText="Nenhum ingresso vendido no período."
              items={vendas.byTicketType.map((tipo) => ({
                key: tipo.key,
                label: tipo.name,
                valueCents: tipo.amountCents,
                detail: `${plural(tipo.tickets, 'ingresso', 'ingressos')} · preço médio ${formatBRL(
                  tipo.tickets > 0 ? Math.round(tipo.amountCents / tipo.tickets) : 0,
                )}`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Receita por dia da semana"
            description="Valor bruto recebido em cada dia da semana e a média dos dias com venda."
          />
          <CardContent className="pt-3">
            <BarList emptyText="Nenhum pagamento no período." items={porDiaDaSemana} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Por forma de pagamento"
          description="Pagamentos aprovados no período, reembolsos feitos no período e taxas."
        />
        <CardContent className="pt-3">
          <TableContainer className="shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH>Forma</TH>
                  <TH className="text-right">Pagamentos</TH>
                  <TH className="text-right">Bruto</TH>
                  <TH className="text-right">Reembolsos</TH>
                  <TH className="text-right">Taxas</TH>
                  <TH className="text-right">Líquido</TH>
                  <TH className="text-right">Participação</TH>
                </tr>
              </THead>
              <TBody>
                {resumo.byGroup.map((grupo) => (
                  <TR key={grupo.group}>
                    <TD className="font-medium text-ink-900">
                      {PAYMENT_GROUP_LABELS[grupo.group]}
                      {formasDoGrupo(grupo.group) ? (
                        <span className="block text-xs font-normal text-ink-500">
                          {formasDoGrupo(grupo.group)}
                        </span>
                      ) : null}
                    </TD>
                    <TD className="tabular text-right">{formatNumber(grupo.payments)}</TD>
                    <TD className="tabular whitespace-nowrap text-right">{formatBRL(grupo.grossCents)}</TD>
                    <TD className="tabular whitespace-nowrap text-right text-grape-700">
                      {grupo.refundsCents > 0 ? `-${formatBRL(grupo.refundsCents)}` : formatBRL(0)}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right">{formatBRL(grupo.feesCents)}</TD>
                    <TD className="tabular whitespace-nowrap text-right font-semibold text-ink-900">
                      {formatBRL(grupo.netCents)}
                    </TD>
                    <TD className="tabular text-right text-ink-600">
                      {liquidoTotal > 0 ? formatPercent(Math.max(0, grupo.netCents) / liquidoTotal) : '0%'}
                    </TD>
                  </TR>
                ))}
              </TBody>
              <tfoot className="border-t border-ink-200 bg-ink-50/60 text-sm font-semibold text-ink-900">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                    {formatNumber(resumo.byGroup.reduce((soma, grupo) => soma + grupo.payments, 0))}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                    {formatBRL(resumo.gross.value)}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                    {resumo.refunds.value > 0 ? `-${formatBRL(resumo.refunds.value)}` : formatBRL(0)}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                    {formatBRL(resumo.fees.value)}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                    {formatBRL(resumo.net.value)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </Table>
          </TableContainer>
          <p className="mt-3 text-[13px] text-ink-500">
            Dinheiro e cartão na maquininha são recebidos pela equipe; as taxas da maquininha não ficam
            registradas no sistema.
          </p>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Dia a dia"
            description="Dias com movimento no período, do mais recente para o mais antigo."
            action={
              can(auth, 'reports.view') ? (
                <Link href={`/admin/relatorios/faturamento?${consulta}`} className={LINK}>
                  Relatório completo
                </Link>
              ) : null
            }
          />
          <CardContent className="pt-3">
            {diasComMovimento.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Nenhum movimento no período"
                description="Pagamentos e reembolsos aparecem aqui assim que acontecem."
              />
            ) : (
              <TableContainer className="shadow-none">
                <Table>
                  <THead>
                    <tr>
                      <TH>Data</TH>
                      <TH className="text-right">Vendas</TH>
                      <TH className="text-right">Bruto</TH>
                      <TH className="text-right">Reembolsos</TH>
                      <TH className="text-right">Taxas</TH>
                      <TH className="text-right">Líquido</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {diasComMovimento.map((dia) => (
                      <TR key={dia.date}>
                        <TD className="whitespace-nowrap">
                          <span className="text-ink-500">{WEEKDAY_SHORT_LABELS[weekdayOf(dia.date)]}</span>{' '}
                          {formatDateBR(dia.date)}
                        </TD>
                        <TD className="tabular text-right">{formatNumber(dia.paidOrders)}</TD>
                        <TD className="tabular whitespace-nowrap text-right">{formatBRL(dia.grossCents)}</TD>
                        <TD className="tabular whitespace-nowrap text-right text-grape-700">
                          {dia.refundsCents > 0 ? `-${formatBRL(dia.refundsCents)}` : ''}
                        </TD>
                        <TD className="tabular whitespace-nowrap text-right">
                          {dia.feesCents > 0 ? formatBRL(dia.feesCents) : ''}
                        </TD>
                        <TD className="tabular whitespace-nowrap text-right font-semibold text-ink-900">
                          {formatBRL(dia.netCents)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                  <tfoot className="border-t border-ink-200 bg-ink-50/60 text-sm font-semibold text-ink-900">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                        {formatNumber(totalDoPeriodo.paidOrders)}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                        {formatBRL(totalDoPeriodo.grossCents)}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                        {totalDoPeriodo.refundsCents > 0 ? `-${formatBRL(totalDoPeriodo.refundsCents)}` : ''}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                        {formatBRL(totalDoPeriodo.feesCents)}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                        {formatBRL(totalDoPeriodo.netCents)}
                      </td>
                    </tr>
                  </tfoot>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Reembolsos do período"
            description={
              resumo.recentRefunds.length > 0
                ? `${plural(resumo.recentRefunds.length, 'devolução', 'devoluções')} mais recentes`
                : undefined
            }
          />
          <CardContent className="pt-3">
            {resumo.recentRefunds.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">Nenhum reembolso no período.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {resumo.recentRefunds.map((reembolso) => (
                  <li key={reembolso.paymentId} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      {can(auth, 'orders.view') ? (
                        <Link
                          href={`/admin/vendas/${reembolso.orderId}`}
                          className="font-mono text-[13px] font-semibold text-ink-900 hover:text-pool-800"
                        >
                          {reembolso.orderCode}
                        </Link>
                      ) : (
                        <p className="font-mono text-[13px] font-semibold text-ink-900">
                          {reembolso.orderCode}
                        </p>
                      )}
                      <p className="truncate text-[13px] text-ink-600">{reembolso.buyerName}</p>
                      <p className="text-xs text-ink-500">
                        {PAYMENT_METHOD_LABELS[reembolso.method]} · {formatDateTimeBR(reembolso.at, fuso)}
                      </p>
                    </div>
                    <p className="tabular shrink-0 font-semibold text-grape-700">
                      -{formatBRL(reembolso.amountCents)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
