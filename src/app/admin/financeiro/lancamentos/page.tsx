import { CalendarClock, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  FinanceHeader,
  financePeriod,
  periodLabel,
  periodQuery,
} from '@/components/admin/finance/finance-header';
import { FinanceEntryActions } from '@/components/admin/finance/finance-entries';
import { KpiCard } from '@/components/admin/kpi-card';
import { KpiGrid } from '@/components/admin/kpi-grid';
import { NoPermission } from '@/components/admin/no-permission';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/feedback';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, todayIn } from '@/lib/dates';
import type { FinanceEntryTypeKey } from '@/lib/finance-entries';
import { plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import type { SearchParamsRecord } from '@/server/filters';
import { listFinanceEntries, type FinanceEntryRow } from '@/server/finance/entries';

export const metadata: Metadata = { title: 'Financeiro' };

const FILTROS: readonly { tipo: FinanceEntryTypeKey | null; rotulo: string; parametro: string }[] = [
  { tipo: null, rotulo: 'Todos', parametro: '' },
  { tipo: 'INCOME', rotulo: 'Receitas', parametro: 'receitas' },
  { tipo: 'EXPENSE', rotulo: 'Despesas', parametro: 'despesas' },
];

function somar(lista: FinanceEntryRow[], tipo: FinanceEntryTypeKey, pago?: boolean): number {
  return lista
    .filter((item) => item.type === tipo && (pago === undefined || item.paid === pago))
    .reduce((soma, item) => soma + item.amountCents, 0);
}

export default async function FinanceiroLancamentosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const auth = await requirePageAuth();
  if (!can(auth, 'finance.view')) return <NoPermission />;

  const parametros = await searchParams;
  const periodo = financePeriod(parametros, auth.park.timezone);
  const filtro =
    FILTROS.find((item) => item.parametro !== '' && item.parametro === parametros.tipo) ?? FILTROS[0];
  const todos = await listFinanceEntries(auth, { range: periodo.range });
  const lista = filtro?.tipo ? todos.filter((item) => item.type === filtro.tipo) : todos;
  const hoje = todayIn(auth.park.timezone);
  const consulta = periodQuery(periodo);
  const podeLancar = can(auth, 'finance.manage');
  const saldo = somar(lista, 'INCOME') - somar(lista, 'EXPENSE');

  return (
    <div className="grid gap-6">
      <FinanceHeader
        tab="lancamentos"
        period={periodo}
        today={hoje}
        canManage={podeLancar}
        description={`Despesas do parque e receitas fora da venda de ingressos de ${periodLabel(periodo)}.`}
      />

      <KpiGrid>
        <KpiCard
          label="Receitas lançadas"
          value={formatBRL(somar(todos, 'INCOME'))}
          hint="bar, eventos, estacionamento e outros"
          icon={TrendingUp}
        />
        <KpiCard
          label="Despesas lançadas"
          value={formatBRL(somar(todos, 'EXPENSE'))}
          hint="contas, folha, manutenção e outros"
          icon={TrendingDown}
        />
        <KpiCard
          label="A pagar"
          value={formatBRL(somar(todos, 'EXPENSE', false))}
          hint="despesas ainda não pagas"
          icon={CalendarClock}
        />
        <KpiCard
          label="A receber"
          value={formatBRL(somar(todos, 'INCOME', false))}
          hint="receitas ainda não recebidas"
          icon={Receipt}
        />
      </KpiGrid>

      <Card>
        <CardHeader
          title="Lançamentos do período"
          description={plural(lista.length, 'lançamento', 'lançamentos')}
          action={
            <nav aria-label="Tipo de lançamento" className="flex gap-1">
              {FILTROS.map((item) => (
                <Link
                  key={item.rotulo}
                  href={`/admin/financeiro/lancamentos?${consulta}${item.parametro ? `&tipo=${item.parametro}` : ''}`}
                  aria-current={item === filtro ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition-colors',
                    item === filtro
                      ? 'bg-ink-900 text-white ring-ink-900'
                      : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                  )}
                >
                  {item.rotulo}
                </Link>
              ))}
            </nav>
          }
        />
        <CardContent className="pt-3">
          {lista.length === 0 ? (
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
            <TableContainer className="shadow-none">
              <Table>
                <THead>
                  <tr>
                    <TH>Data</TH>
                    <TH>Descrição</TH>
                    <TH>Categoria</TH>
                    <TH>Situação</TH>
                    <TH className="text-right">Valor</TH>
                    {podeLancar ? (
                      <TH>
                        <span className="sr-only">Ações</span>
                      </TH>
                    ) : null}
                  </tr>
                </THead>
                <TBody>
                  {lista.map((item) => {
                    const receita = item.type === 'INCOME';
                    return (
                      <TR key={item.id}>
                        <TD className="tabular whitespace-nowrap">{formatDateBR(item.date)}</TD>
                        <TD className="max-w-80">
                          <p className="truncate font-medium text-ink-900">{item.description}</p>
                          {item.notes ? <p className="truncate text-xs text-ink-500">{item.notes}</p> : null}
                        </TD>
                        <TD className="whitespace-nowrap text-ink-600">{item.categoryLabel}</TD>
                        <TD>
                          <Badge tone={item.paid ? 'success' : 'warning'}>
                            {item.paid ? (receita ? 'Recebido' : 'Pago') : receita ? 'A receber' : 'A pagar'}
                          </Badge>
                        </TD>
                        <TD
                          className={cn(
                            'tabular whitespace-nowrap text-right font-semibold',
                            receita ? 'text-success-700' : 'text-danger-700',
                          )}
                        >
                          {receita ? '+' : '−'} {formatBRL(item.amountCents)}
                        </TD>
                        {podeLancar ? (
                          <TD className="w-24">
                            <FinanceEntryActions entry={item} today={hoje} />
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })}
                </TBody>
                <tfoot className="border-t border-ink-200 bg-ink-50/60 text-sm font-semibold text-ink-900">
                  <tr>
                    <td className="px-4 py-3" colSpan={4}>
                      Saldo dos lançamentos
                    </td>
                    <td
                      className={cn(
                        'tabular whitespace-nowrap px-4 py-3 text-right',
                        saldo < 0 ? 'text-danger-700' : 'text-ink-900',
                      )}
                    >
                      {formatBRL(saldo)}
                    </td>
                    {podeLancar ? <td /> : null}
                  </tr>
                </tfoot>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
