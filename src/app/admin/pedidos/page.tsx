import { ChevronRight, Download, ReceiptText, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { NoPermission } from '@/components/admin/no-permission';
import { ChannelBadge, FinancialStatusBadge, OrderStatusBadge } from '@/components/admin/status-badges';
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
  FINANCIAL_STATUSES,
  ORDER_CHANNEL_LABELS,
  ORDER_CHANNELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
} from '@/lib/orders';
import { formatRelativeTime } from '@/lib/relative-time';
import { WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { parseOrderFilters, type SearchParamsRecord } from '@/server/filters';
import { listOrders, type OrderListFilters } from '@/server/orders/admin';

export const metadata: Metadata = { title: 'Pedidos' };

function consulta(filtros: OrderListFilters, pagina?: number): string {
  const busca = new URLSearchParams();
  if (filtros.q) busca.set('q', filtros.q);
  if (filtros.status) busca.set('situacao', filtros.status);
  if (filtros.channel) busca.set('canal', filtros.channel);
  if (filtros.financial) busca.set('financeiro', filtros.financial);
  if (filtros.visitFrom) busca.set('visitaDe', filtros.visitFrom);
  if (filtros.visitTo) busca.set('visitaAte', filtros.visitTo);
  if (filtros.createdFrom) busca.set('compraDe', filtros.createdFrom);
  if (filtros.createdTo) busca.set('compraAte', filtros.createdTo);
  if (pagina && pagina > 1) busca.set('pagina', String(pagina));
  return busca.toString();
}

export default async function PedidosPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const auth = await requirePageAuth();
  if (!can(auth, 'orders.view')) return <NoPermission />;

  const filtros = parseOrderFilters(await searchParams);
  const resultado = await listOrders(auth, filtros);
  const agora = new Date();
  const filtrando = consulta({ ...filtros, page: undefined }) !== '';
  const hrefPagina = (pagina: number) => {
    const texto = consulta(filtros, pagina);
    return texto ? `/admin/pedidos?${texto}` : '/admin/pedidos';
  };
  const filtrosDaPlanilha = consulta({ ...filtros, page: undefined });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Pedidos"
        description="Compras do site e da bilheteria, com pagamento, ingressos e todo o histórico."
        actions={
          can(auth, 'orders.export') ? (
            <a
              href={`/api/admin/orders/export${filtrosDaPlanilha ? `?${filtrosDaPlanilha}` : ''}`}
              className={buttonClasses('secondary')}
            >
              <Download className="size-4" aria-hidden />
              Exportar planilha
            </a>
          ) : null
        }
      />

      <form role="search" className="grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={filtros.q}
              placeholder="Pedido, nome, e-mail, CPF ou código do ingresso"
              aria-label="Buscar pedido"
              className="pl-10"
            />
          </div>
          <Select name="situacao" defaultValue={filtros.status ?? ''} aria-label="Situação">
            <option value="">Todas as situações</option>
            {ORDER_STATUSES.map((situacao) => (
              <option key={situacao} value={situacao}>
                {ORDER_STATUS_LABELS[situacao]}
              </option>
            ))}
          </Select>
          <Select name="financeiro" defaultValue={filtros.financial ?? ''} aria-label="Financeiro">
            <option value="">Todo o financeiro</option>
            {FINANCIAL_STATUSES.map((situacao) => (
              <option key={situacao} value={situacao}>
                {FINANCIAL_STATUS_LABELS[situacao]}
              </option>
            ))}
          </Select>
          <Select name="canal" defaultValue={filtros.channel ?? ''} aria-label="Canal">
            <option value="">Todos os canais</option>
            {ORDER_CHANNELS.map((canal) => (
              <option key={canal} value={canal}>
                {ORDER_CHANNEL_LABELS[canal]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="visita-de">Visita a partir de</Label>
            <Input id="visita-de" type="date" name="visitaDe" defaultValue={filtros.visitFrom} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="visita-ate">Visita até</Label>
            <Input id="visita-ate" type="date" name="visitaAte" defaultValue={filtros.visitTo} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="compra-de">Compra a partir de</Label>
            <Input id="compra-de" type="date" name="compraDe" defaultValue={filtros.createdFrom} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="compra-ate">Compra até</Label>
            <Input id="compra-ate" type="date" name="compraAte" defaultValue={filtros.createdTo} />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" className={buttonClasses('primary', 'md', 'flex-1 lg:flex-none')}>
              Filtrar
            </button>
            {filtrando ? (
              <Link href="/admin/pedidos" className={buttonClasses('ghost', 'md', 'flex-1 lg:flex-none')}>
                Limpar
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {resultado.total > 0 ? (
        <p className="text-sm text-ink-600">
          {plural(resultado.total, 'pedido encontrado', 'pedidos encontrados')}
          {resultado.summary.confirmedOrders > 0 ? (
            <>
              {' '}
              · {plural(resultado.summary.confirmedOrders, 'confirmado', 'confirmados')} somando{' '}
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
            title={filtrando ? 'Nenhum pedido encontrado' : 'Nenhum pedido ainda'}
            description={
              filtrando
                ? 'Confira o número, o nome ou os filtros escolhidos.'
                : 'As compras aparecem aqui assim que o cliente conclui o pedido.'
            }
            action={
              filtrando ? (
                <Link
                  href="/admin/pedidos"
                  className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                >
                  Limpar filtros
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {resultado.items.map((pedido) => (
              <li key={pedido.id}>
                <Link
                  href={`/admin/pedidos/${pedido.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70 active:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[13px] font-semibold text-ink-900">{pedido.code}</p>
                      <p className="tabular text-sm font-semibold text-ink-900">
                        {formatBRL(pedido.totalCents)}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-700">{pedido.buyerName}</p>
                    <p className="text-[13px] text-ink-500">
                      Visita {WEEKDAY_SHORT_LABELS[weekdayOf(pedido.visitDate)]}{' '}
                      {formatDateBR(pedido.visitDate)} ·{' '}
                      {plural(pedido.ticketsCount, 'ingresso', 'ingressos')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <OrderStatusBadge status={pedido.status} />
                      <ChannelBadge channel={pedido.channel} />
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <TableContainer className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Pedido</TH>
                  <TH>Comprador</TH>
                  <TH>Visita</TH>
                  <TH className="text-right">Ingressos</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Situação</TH>
                  <TH>Canal</TH>
                  <TH className="w-10">
                    <span className="sr-only">Abrir</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {resultado.items.map((pedido) => (
                  <TR key={pedido.id} className="hover:bg-pool-50/40">
                    <TD className="whitespace-nowrap">
                      <Link
                        href={`/admin/pedidos/${pedido.id}`}
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
                    <TD className="max-w-56">
                      <p className="truncate font-medium text-ink-900">{pedido.buyerName}</p>
                      <p className="truncate text-xs text-ink-500">{pedido.buyerEmail}</p>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <span className="text-ink-500">
                        {WEEKDAY_SHORT_LABELS[weekdayOf(pedido.visitDate)]}
                      </span>{' '}
                      {formatDateBR(pedido.visitDate)}
                    </TD>
                    <TD className="tabular text-right">{formatNumber(pedido.ticketsCount)}</TD>
                    <TD className="whitespace-nowrap text-right">
                      <p className="tabular font-semibold text-ink-900">{formatBRL(pedido.totalCents)}</p>
                      {pedido.couponCode ? (
                        <p className="text-xs text-grape-700">cupom {pedido.couponCode}</p>
                      ) : null}
                    </TD>
                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <OrderStatusBadge status={pedido.status} />
                        {pedido.financialStatus === 'PAID' && pedido.status !== 'CONFIRMED' ? (
                          <FinancialStatusBadge status={pedido.financialStatus} />
                        ) : null}
                        {pedido.financialStatus === 'REFUNDED' ? (
                          <FinancialStatusBadge status={pedido.financialStatus} />
                        ) : null}
                      </div>
                    </TD>
                    <TD>
                      <ChannelBadge channel={pedido.channel} />
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/pedidos/${pedido.id}`}
                        className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        aria-label={`Abrir pedido ${pedido.code}`}
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
