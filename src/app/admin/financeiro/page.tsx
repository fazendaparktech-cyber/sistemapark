import {
  BadgePercent,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Hourglass,
  Percent,
  ReceiptText,
  Undo2,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { KpiCard } from '@/components/admin/kpi-card';
import { NoPermission } from '@/components/admin/no-permission';
import { PeriodFilter } from '@/components/admin/period-filter';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
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
import { parsePeriod, type ParsedPeriod } from '@/lib/periods';
import { WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import type { SearchParamsRecord } from '@/server/filters';
import { getFinanceSummary } from '@/server/finance/service';

export const metadata: Metadata = { title: 'Financeiro' };

const COMPARADO = 'comparado ao período anterior';

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function consultaDoPeriodo(periodo: ParsedPeriod): string {
  return periodo.key === 'personalizado'
    ? `periodo=personalizado&de=${periodo.range.from}&ate=${periodo.range.to}`
    : `periodo=${periodo.key}`;
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const auth = await requirePageAuth();
  if (!can(auth, 'finance.view')) return <NoPermission />;

  const parametros = await searchParams;
  const periodo = parsePeriod(
    { periodo: primeiro(parametros.periodo), de: primeiro(parametros.de), ate: primeiro(parametros.ate) },
    todayIn(auth.park.timezone),
    'mes',
  );
  const resumo = await getFinanceSummary(auth, periodo);
  const fuso = auth.park.timezone;
  const intervalo =
    periodo.range.from === periodo.range.to
      ? formatDateBR(periodo.range.from)
      : `${formatDateBR(periodo.range.from)} a ${formatDateBR(periodo.range.to)}`;
  const consulta = consultaDoPeriodo(periodo);
  const exporta = can(auth, 'reports.export');
  const diasComMovimento = resumo.daily
    .filter((dia) => dia.grossCents !== 0 || dia.refundsCents !== 0 || dia.paidOrders !== 0)
    .reverse();
  const liquidoTotal = resumo.net.value;
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

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Financeiro"
        description={`Receita, reembolsos, taxas e formas de pagamento de ${intervalo}.`}
        actions={
          exporta ? (
            <>
              <a
                href={`/api/admin/reports/faturamento/export?formato=xlsx&${consulta}`}
                className={buttonClasses('secondary')}
              >
                <FileSpreadsheet className="size-4" aria-hidden />
                Excel
              </a>
              <a
                href={`/api/admin/reports/faturamento/export?formato=csv&${consulta}`}
                className={buttonClasses('secondary')}
              >
                <Download className="size-4" aria-hidden />
                CSV
              </a>
            </>
          ) : null
        }
      />
      <PeriodFilter basePath="/admin/financeiro" period={periodo} />

      <section
        aria-label="Indicadores financeiros"
        className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <KpiCard
          label="Receita bruta"
          value={formatBRL(resumo.gross.value)}
          change={resumo.gross.change}
          hint={COMPARADO}
          icon={CircleDollarSign}
        />
        <KpiCard
          label="Reembolsos"
          value={formatBRL(resumo.refunds.value)}
          change={resumo.refunds.change}
          inverse
          hint="devolvidos no período"
          icon={Undo2}
          tone="grape"
        />
        <KpiCard
          label="Taxas"
          value={formatBRL(resumo.fees.value)}
          change={resumo.fees.change}
          inverse
          hint="cobradas pelo provedor de pagamento"
          icon={Percent}
          tone="sun"
        />
        <KpiCard
          label="Receita líquida"
          value={formatBRL(resumo.net.value)}
          change={resumo.net.change}
          hint="bruta − reembolsos − taxas"
          icon={Wallet}
          tone="citrus"
        />
        <KpiCard
          label="Vendas pagas"
          value={formatNumber(resumo.paidOrders.value)}
          change={resumo.paidOrders.change}
          hint={formatBRL(resumo.paidAmount.value)}
          icon={ReceiptText}
          tone="pool"
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
          tone="ink"
        />
        <KpiCard
          label="Descontos concedidos"
          value={formatBRL(resumo.discounts.value)}
          change={resumo.discounts.change}
          inverse
          hint="cupons e descontos no balcão"
          icon={BadgePercent}
          tone="sun"
        />
      </section>

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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Dia a dia"
            description="Dias com movimento no período, do mais recente para o mais antigo."
            action={
              can(auth, 'reports.view') ? (
                <Link
                  href={`/admin/relatorios/faturamento?${consulta}`}
                  className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                >
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
