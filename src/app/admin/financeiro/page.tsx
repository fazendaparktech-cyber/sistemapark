import {
  CalendarClock,
  HandCoins,
  Percent,
  Receipt,
  Scale,
  Ticket,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { IncomeExpenseChart } from '@/components/admin/charts/income-expense-chart';
import { PieBreakdown } from '@/components/admin/charts/pie-breakdown';
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
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/feedback';
import { formatDateBR, todayIn } from '@/lib/dates';
import { formatPercent, plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import type { SearchParamsRecord } from '@/server/filters';
import { getFinanceOverview, listFinanceEntries } from '@/server/finance/entries';

export const metadata: Metadata = { title: 'Financeiro' };

const COMPARADO = 'comparado ao período anterior';

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const auth = await requirePageAuth();
  if (!can(auth, 'finance.view')) return <NoPermission />;

  const periodo = financePeriod(await searchParams, auth.park.timezone);
  const [visao, lancamentos] = await Promise.all([
    getFinanceOverview(auth, periodo),
    listFinanceEntries(auth, { range: periodo.range }),
  ]);
  const hoje = todayIn(auth.park.timezone);
  const consulta = periodQuery(periodo);
  const podeLancar = can(auth, 'finance.manage');
  const ultimos = lancamentos.slice(0, 6);

  return (
    <div className="grid gap-6">
      <FinanceHeader
        tab="geral"
        period={periodo}
        today={hoje}
        canManage={podeLancar}
        description={`Receitas, despesas e resultado do parque de ${periodLabel(periodo)}.`}
      />

      <KpiGrid>
        <KpiCard
          label="Receitas"
          value={formatBRL(visao.income.value)}
          change={visao.income.change}
          hint="ingressos (líquido) + outras receitas"
          icon={TrendingUp}
        />
        <KpiCard
          label="Despesas"
          value={formatBRL(visao.expenses.value)}
          change={visao.expenses.change}
          inverse
          hint={COMPARADO}
          icon={TrendingDown}
        />
        <KpiCard
          label="Resultado"
          value={formatBRL(visao.result.value)}
          change={visao.result.change}
          hint="receitas − despesas"
          icon={Scale}
        />
        <KpiCard
          label="Margem"
          value={visao.margin === null ? '—' : formatPercent(visao.margin)}
          hint="quanto sobra de cada real que entra"
          icon={Percent}
        />
        <KpiCard
          label="Ingressos (líquido)"
          value={formatBRL(visao.ticketNetCents)}
          hint="vendas − reembolsos − taxas"
          icon={Ticket}
        />
        <KpiCard
          label="Outras receitas"
          value={formatBRL(visao.otherIncomeCents)}
          hint="bar, eventos, estacionamento e outros"
          icon={HandCoins}
        />
        <KpiCard
          label="A pagar"
          value={formatBRL(visao.toPay.amountCents)}
          hint={
            visao.toPay.count > 0
              ? plural(visao.toPay.count, 'despesa em aberto', 'despesas em aberto')
              : 'nenhuma despesa em aberto'
          }
          icon={CalendarClock}
        />
        <KpiCard
          label="A receber"
          value={formatBRL(visao.toReceive.amountCents)}
          hint={
            visao.toReceive.count > 0
              ? plural(visao.toReceive.count, 'receita em aberto', 'receitas em aberto')
              : 'nenhuma receita em aberto'
          }
          icon={Receipt}
        />
      </KpiGrid>

      <Card>
        <CardHeader
          title="Receitas x despesas"
          description="Últimos 6 meses. As receitas somam o líquido dos ingressos e as outras receitas lançadas."
        />
        <CardContent className="pt-3">
          <IncomeExpenseChart points={visao.months} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="De onde vem a receita" description="Participação de cada origem no período." />
          <CardContent className="pt-3">
            <PieBreakdown money slices={visao.incomeComposition} emptyText="Nenhuma receita no período." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Para onde vai o dinheiro"
            description="Despesas lançadas por categoria no período."
          />
          <CardContent className="pt-3">
            <PieBreakdown
              money
              slices={visao.expensesByCategory}
              emptyText="Nenhuma despesa lançada no período."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Últimos lançamentos"
          description="Receitas e despesas lançadas no período."
          action={
            lancamentos.length > 0 ? (
              <Link
                href={`/admin/financeiro/lancamentos?${consulta}`}
                className="text-sm font-semibold text-pool-700 hover:text-pool-800"
              >
                Ver todos
              </Link>
            ) : null
          }
        />
        <CardContent className="pt-3">
          {ultimos.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhum lançamento no período"
              description={
                podeLancar
                  ? 'Use "Novo lançamento" para registrar despesas (energia, folha, manutenção) e outras receitas.'
                  : 'Receitas e despesas lançadas aparecem aqui.'
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {ultimos.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{item.description}</p>
                    <p className="text-xs text-ink-500">
                      {formatDateBR(item.date)} · {item.categoryLabel}
                      {item.paid ? '' : item.type === 'INCOME' ? ' · a receber' : ' · a pagar'}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'tabular shrink-0 text-sm font-semibold',
                      item.type === 'INCOME' ? 'text-success-700' : 'text-danger-700',
                    )}
                  >
                    {item.type === 'INCOME' ? '+' : '−'} {formatBRL(item.amountCents)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
