import { ChevronRight, Download, Plus, ReceiptText, Search, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { NoPermission } from '@/components/admin/no-permission';
import { ChannelBadge, SaleStatusBadge } from '@/components/admin/status-badges';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Input, Label, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, formatDateTimeBR, weekdayOf } from '@/lib/dates';
import { formatNumber, plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import {
  FINANCIAL_STATUS_LABELS,
  ORDER_CHANNEL_LABELS,
  PAYMENT_GROUP_LABELS,
  PAYMENT_GROUPS,
  PAYMENT_METHOD_LABELS,
  SALE_STATUS_LABELS,
  SALE_STATUSES,
} from '@/lib/orders';
import { formatRelativeTime } from '@/lib/relative-time';
import { WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { parseOrderFilters, type SearchParamsRecord } from '@/server/filters';
import { listOrders, type AdminOrderListItem, type OrderListFilters } from '@/server/orders/admin';

export const metadata: Metadata = { title: 'Vendas' };

const CANAIS = ['ONLINE', 'POS'] as const;

function consulta(filtros: OrderListFilters, pagina?: number): string {
  const busca = new URLSearchParams();
  if (filtros.q) busca.set('q', filtros.q);
  if (filtros.status) busca.set('situacao', filtros.status);
  if (filtros.payment) busca.set('pagamento', filtros.payment);
  if (filtros.channel) busca.set('canal', filtros.channel);
  if (filtros.financial) busca.set('financeiro', filtros.financial);
  if (filtros.visitFrom) busca.set('visitaDe', filtros.visitFrom);
  if (filtros.visitTo) busca.set('visitaAte', filtros.visitTo);
  if (filtros.createdFrom) busca.set('compraDe', filtros.createdFrom);
  if (filtros.createdTo) busca.set('compraAte', filtros.createdTo);
  if (pagina && pagina > 1) busca.set('pagina', String(pagina));
  return busca.toString();
}

function formaDePagamento(venda: AdminOrderListItem): string {
  if (venda.paymentMethod) return PAYMENT_METHOD_LABELS[venda.paymentMethod];
  return venda.totalCents === 0 ? 'Sem cobrança' : 'Não gerado';
}

export default async function VendasPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const auth = await requirePageAuth();
  if (!can(auth, 'orders.view')) return <NoPermission />;

  const filtros = parseOrderFilters(await searchParams);
  const resultado = await listOrders(auth, filtros);
  const agora = new Date();
  const fuso = auth.park.timezone;
  const filtrando = consulta({ ...filtros, page: undefined }) !== '';
  const hrefPagina = (pagina: number) => {
    const texto = consulta(filtros, pagina);
    return texto ? `/admin/vendas?${texto}` : '/admin/vendas';
  };
  const filtrosDaPlanilha = consulta({ ...filtros, page: undefined });
  const semFiltroFinanceiro = consulta({ ...filtros, financial: undefined, page: undefined });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Vendas"
        description="Vendas online e presenciais, com pagamento, ingressos e o histórico de cada pedido."
        actions={
          <>
            {can(auth, 'reports.export') ? (
              <a
                href={`/api/admin/orders/export${filtrosDaPlanilha ? `?${filtrosDaPlanilha}` : ''}`}
                className={buttonClasses('secondary')}
              >
                <Download className="size-4" aria-hidden />
                Exportar planilha
              </a>
            ) : null}
            {can(auth, 'pos.sell') ? (
              <Link href="/admin/vendas/nova" className={buttonClasses('primary')}>
                <Plus className="size-4" aria-hidden />
                Nova venda
              </Link>
            ) : null}
          </>
        }
      />

      <form role="search" className="grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70">
        {filtros.financial ? <input type="hidden" name="financeiro" value={filtros.financial} /> : null}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={filtros.q}
              placeholder="Pedido, nome, CPF, celular ou ingresso"
              aria-label="Buscar venda"
              className="pl-10"
            />
          </div>
          <Select name="situacao" defaultValue={filtros.status ?? ''} aria-label="Situação">
            <option value="">Todas as situações</option>
            {SALE_STATUSES.map((situacao) => (
              <option key={situacao} value={situacao}>
                {SALE_STATUS_LABELS[situacao]}
              </option>
            ))}
          </Select>
          <Select name="pagamento" defaultValue={filtros.payment ?? ''} aria-label="Forma de pagamento">
            <option value="">Todos os pagamentos</option>
            {PAYMENT_GROUPS.map((grupo) => (
              <option key={grupo} value={grupo}>
                {PAYMENT_GROUP_LABELS[grupo]}
              </option>
            ))}
          </Select>
          <Select name="canal" defaultValue={filtros.channel ?? ''} aria-label="Canal">
            <option value="">Online e presencial</option>
            {CANAIS.map((canal) => (
              <option key={canal} value={canal}>
                {ORDER_CHANNEL_LABELS[canal]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="compra-de">Compra a partir de</Label>
            <Input id="compra-de" type="date" name="compraDe" defaultValue={filtros.createdFrom} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="compra-ate">Compra até</Label>
            <Input id="compra-ate" type="date" name="compraAte" defaultValue={filtros.createdTo} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="visita-de">Visita a partir de</Label>
            <Input id="visita-de" type="date" name="visitaDe" defaultValue={filtros.visitFrom} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="visita-ate">Visita até</Label>
            <Input id="visita-ate" type="date" name="visitaAte" defaultValue={filtros.visitTo} />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" className={buttonClasses('primary', 'md', 'flex-1 lg:flex-none')}>
              Filtrar
            </button>
            {filtrando ? (
              <Link href="/admin/vendas" className={buttonClasses('ghost', 'md', 'flex-1 lg:flex-none')}>
                Limpar
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {filtros.financial ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="warning">Financeiro: {FINANCIAL_STATUS_LABELS[filtros.financial].toLowerCase()}</Badge>
          <Link
            href={semFiltroFinanceiro ? `/admin/vendas?${semFiltroFinanceiro}` : '/admin/vendas'}
            className="inline-flex items-center gap-1 font-semibold text-pool-700 hover:text-pool-800"
          >
            <X className="size-3.5" aria-hidden />
            Remover filtro
          </Link>
        </div>
      ) : null}

      {resultado.total > 0 ? (
        <p className="text-sm text-ink-600">
          {plural(resultado.total, 'venda encontrada', 'vendas encontradas')}
          {resultado.summary.confirmedOrders > 0 ? (
            <>
              {' '}
              · {plural(resultado.summary.confirmedOrders, 'paga', 'pagas')} somando{' '}
              <span className="tabular font-semibold text-ink-900">
                {formatBRL(resultado.summary.confirmedTotalCents)}
              </span>
            </>
          ) : null}
        </p>
      ) : null}

      {resultado.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title={filtrando ? 'Nenhuma venda encontrada' : 'Nenhuma venda ainda'}
            description={
              filtrando
                ? 'Confira o número, o nome ou os filtros escolhidos.'
                : 'As vendas do site e da bilheteria aparecem aqui assim que são registradas.'
            }
            action={
              filtrando ? (
                <Link
                  href="/admin/vendas"
                  className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                >
                  Limpar filtros
                </Link>
              ) : can(auth, 'pos.sell') ? (
                <Link href="/admin/vendas/nova" className={buttonClasses('primary')}>
                  <Plus className="size-4" aria-hidden />
                  Nova venda
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 lg:hidden">
            {resultado.items.map((venda) => (
              <li key={venda.id}>
                <Link
                  href={`/admin/vendas/${venda.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70 active:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[13px] font-semibold text-ink-900">{venda.code}</p>
                      <p className="tabular text-sm font-semibold text-ink-900">
                        {formatBRL(venda.totalCents)}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-700">{venda.buyerName}</p>
                    <p className="text-[13px] text-ink-500">
                      Visita {WEEKDAY_SHORT_LABELS[weekdayOf(venda.visitDate)]}{' '}
                      {formatDateBR(venda.visitDate)} · {plural(venda.ticketsCount, 'ingresso', 'ingressos')}{' '}
                      · {formaDePagamento(venda)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <SaleStatusBadge status={venda.saleStatus} />
                      <ChannelBadge channel={venda.channel} />
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <TableContainer className="hidden lg:block">
            <Table>
              <THead>
                <tr>
                  <TH>Pedido</TH>
                  <TH>Cliente</TH>
                  <TH>Compra</TH>
                  <TH>Visita</TH>
                  <TH className="text-right">Ingressos</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Pagamento</TH>
                  <TH>Situação</TH>
                  <TH className="w-10">
                    <span className="sr-only">Abrir</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {resultado.items.map((venda) => (
                  <TR key={venda.id} className="hover:bg-pool-50/40">
                    <TD className="whitespace-nowrap">
                      <Link
                        href={`/admin/vendas/${venda.id}`}
                        className="font-mono text-[13px] font-semibold text-ink-900 hover:text-pool-800"
                      >
                        {venda.code}
                      </Link>
                      <div className="mt-1">
                        <ChannelBadge channel={venda.channel} />
                      </div>
                    </TD>
                    <TD className="max-w-56">
                      <p className="truncate font-medium text-ink-900">{venda.buyerName}</p>
                      <p className="truncate text-xs text-ink-500">{venda.buyerEmail ?? 'Sem e-mail'}</p>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <p className="text-ink-800">{formatDateTimeBR(venda.createdAt, fuso)}</p>
                      <p className="text-xs text-ink-500">{formatRelativeTime(venda.createdAt, agora)}</p>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <span className="text-ink-500">{WEEKDAY_SHORT_LABELS[weekdayOf(venda.visitDate)]}</span>{' '}
                      {formatDateBR(venda.visitDate)}
                    </TD>
                    <TD className="tabular text-right">{formatNumber(venda.ticketsCount)}</TD>
                    <TD className="whitespace-nowrap text-right">
                      <p className="tabular font-semibold text-ink-900">{formatBRL(venda.totalCents)}</p>
                      {venda.couponCode ? (
                        <p className="text-xs text-grape-700">cupom {venda.couponCode}</p>
                      ) : venda.discountCents > 0 ? (
                        <p className="text-xs text-grape-700">desconto {formatBRL(venda.discountCents)}</p>
                      ) : null}
                    </TD>
                    <TD className="whitespace-nowrap text-ink-700">{formaDePagamento(venda)}</TD>
                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <SaleStatusBadge status={venda.saleStatus} />
                        {venda.financialStatus === 'PAID' && venda.status !== 'CONFIRMED' ? (
                          <Badge tone="warning">Pago sem ingresso</Badge>
                        ) : null}
                      </div>
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/vendas/${venda.id}`}
                        className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        aria-label={`Abrir venda ${venda.code}`}
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>

          <Pagination
            page={resultado.page}
            pageSize={resultado.pageSize}
            total={resultado.total}
            hrefFor={hrefPagina}
          />
        </>
      )}
    </div>
  );
}
