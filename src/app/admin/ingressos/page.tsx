import { ChevronRight, Search, Ticket } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { NoPermission } from '@/components/admin/no-permission';
import { TicketStatusBadge } from '@/components/admin/status-badges';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Input, Label, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, formatDateTimeBR, formatTimeBR, todayIn, weekdayOf } from '@/lib/dates';
import { plural } from '@/lib/format';
import { TICKET_STATUS_LABELS } from '@/lib/orders';
import { TICKET_FILTER_STATUSES } from '@/lib/tickets';
import { WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { parseTicketFilters, type SearchParamsRecord } from '@/server/filters';
import type { TicketFilters } from '@/server/tickets/search';
import { listTickets } from '@/server/tickets/service';

export const metadata: Metadata = { title: 'Ingressos' };

function consulta(filtros: TicketFilters, pagina?: number): string {
  const busca = new URLSearchParams();
  if (filtros.q) busca.set('q', filtros.q);
  if (filtros.status) busca.set('situacao', filtros.status);
  if (filtros.visitFrom) busca.set('visitaDe', filtros.visitFrom);
  if (filtros.visitTo) busca.set('visitaAte', filtros.visitTo);
  if (filtros.ticketTypeId) busca.set('tipo', filtros.ticketTypeId);
  if (pagina && pagina > 1) busca.set('pagina', String(pagina));
  return busca.toString();
}

export default async function IngressosPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const auth = await requirePageAuth();
  if (!can(auth, 'tickets.view')) return <NoPermission />;

  const filtros = parseTicketFilters(await searchParams);
  const resultado = await listTickets(auth, filtros);
  const fuso = auth.park.timezone;
  const hoje = todayIn(fuso);
  const verVendas = can(auth, 'orders.view');
  const filtrando = consulta({ ...filtros, page: undefined }) !== '';
  const hrefPagina = (pagina: number) => {
    const texto = consulta(filtros, pagina);
    return texto ? `/admin/ingressos?${texto}` : '/admin/ingressos';
  };
  const deHoje = `/admin/ingressos?visitaDe=${hoje}&visitaAte=${hoje}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Ingressos"
        description="Cada ingresso emitido, com QR Code próprio, situação e registro de entrada na portaria."
        actions={
          <Link href={deHoje} className={buttonClasses('secondary')}>
            Ingressos de hoje
          </Link>
        }
      />

      <form role="search" className="grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70">
        {filtros.ticketTypeId ? <input type="hidden" name="tipo" value={filtros.ticketTypeId} /> : null}
        <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={filtros.q}
              placeholder="Código, nome, CPF, celular ou pedido"
              aria-label="Buscar ingresso"
              className="pl-10"
            />
          </div>
          <Select name="situacao" defaultValue={filtros.status ?? ''} aria-label="Situação">
            <option value="">Todas as situações</option>
            {TICKET_FILTER_STATUSES.map((situacao) => (
              <option key={situacao} value={situacao}>
                {TICKET_STATUS_LABELS[situacao]}
              </option>
            ))}
          </Select>
          <div className="grid gap-1.5">
            <Label htmlFor="ingresso-visita-de">Visita a partir de</Label>
            <Input id="ingresso-visita-de" type="date" name="visitaDe" defaultValue={filtros.visitFrom} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ingresso-visita-ate">Visita até</Label>
            <Input id="ingresso-visita-ate" type="date" name="visitaAte" defaultValue={filtros.visitTo} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className={buttonClasses('primary', 'md', 'flex-1 lg:flex-none')}>
              Filtrar
            </button>
            {filtrando ? (
              <Link href="/admin/ingressos" className={buttonClasses('ghost', 'md', 'flex-1 lg:flex-none')}>
                Limpar
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {resultado.total > 0 ? (
        <p className="text-sm text-ink-600">
          {plural(resultado.total, 'ingresso encontrado', 'ingressos encontrados')}
        </p>
      ) : null}

      {resultado.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Ticket}
            title={filtrando ? 'Nenhum ingresso encontrado' : 'Nenhum ingresso emitido ainda'}
            description={
              filtrando
                ? 'Confira o código, o nome ou os filtros escolhidos.'
                : 'Os ingressos aparecem aqui assim que uma venda é registrada.'
            }
            action={
              filtrando ? (
                <Link
                  href="/admin/ingressos"
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
          <ul className="grid gap-3 lg:hidden">
            {resultado.items.map((ingresso) => (
              <li key={ingresso.id}>
                <Link
                  href={`/admin/ingressos/${ingresso.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70 active:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[13px] font-semibold text-ink-900">{ingresso.code}</p>
                      <TicketStatusBadge status={ingresso.status} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-700">
                      {ingresso.holderName ?? ingresso.buyerName}
                    </p>
                    <p className="text-[13px] text-ink-500">
                      {ingresso.typeName} ·{' '}
                      {ingresso.visitDate === hoje ? 'hoje' : formatDateBR(ingresso.visitDate)}
                      {ingresso.checkedInAt ? ` · entrou às ${formatTimeBR(ingresso.checkedInAt, fuso)}` : ''}
                    </p>
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
                  <TH>Código</TH>
                  <TH>Visitante</TH>
                  <TH>Tipo</TH>
                  <TH>Visita</TH>
                  <TH>Situação</TH>
                  <TH>Entrada</TH>
                  <TH>Pedido</TH>
                  <TH className="w-10">
                    <span className="sr-only">Abrir</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {resultado.items.map((ingresso) => (
                  <TR key={ingresso.id} className="hover:bg-pool-50/40">
                    <TD className="whitespace-nowrap">
                      <Link
                        href={`/admin/ingressos/${ingresso.id}`}
                        className="font-mono text-[13px] font-semibold text-ink-900 hover:text-pool-800"
                      >
                        {ingresso.code}
                      </Link>
                      {ingresso.isCourtesy ? (
                        <div className="mt-1">
                          <Badge tone="citrus">Cortesia</Badge>
                        </div>
                      ) : null}
                    </TD>
                    <TD className="max-w-60">
                      <p className="truncate font-medium text-ink-900">
                        {ingresso.holderName ?? <span className="text-ink-500">Sem nome informado</span>}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {ingresso.holderCpfMasked ? `CPF ${ingresso.holderCpfMasked} · ` : ''}
                        compra de {ingresso.buyerName}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap text-ink-700">{ingresso.typeName}</TD>
                    <TD className="whitespace-nowrap">
                      <span className="text-ink-500">
                        {WEEKDAY_SHORT_LABELS[weekdayOf(ingresso.visitDate)]}
                      </span>{' '}
                      {formatDateBR(ingresso.visitDate)}
                    </TD>
                    <TD>
                      <TicketStatusBadge status={ingresso.status} />
                    </TD>
                    <TD className="whitespace-nowrap">
                      {ingresso.checkedInAt ? (
                        <>
                          <p className="text-ink-800">{formatDateTimeBR(ingresso.checkedInAt, fuso)}</p>
                        </>
                      ) : (
                        <span className="text-ink-400">Não entrou</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {verVendas ? (
                        <Link
                          href={`/admin/vendas/${ingresso.orderId}`}
                          className="font-mono text-[13px] text-pool-700 hover:text-pool-800"
                        >
                          {ingresso.orderCode}
                        </Link>
                      ) : (
                        <span className="font-mono text-[13px] text-ink-700">{ingresso.orderCode}</span>
                      )}
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/ingressos/${ingresso.id}`}
                        className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        aria-label={`Abrir ingresso ${ingresso.code}`}
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
