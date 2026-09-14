import {
  ArrowLeft,
  CalendarCheck,
  CircleDollarSign,
  Mail,
  MessageCircle,
  Phone,
  ReceiptText,
  Ticket,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EditCustomerDialog } from '@/components/admin/customers/edit-customer-dialog';
import { MetricCard } from '@/components/admin/metric-card';
import { NoPermission } from '@/components/admin/no-permission';
import { ChannelBadge, SaleStatusBadge, TicketStatusBadge } from '@/components/admin/status-badges';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/feedback';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, formatDateTimeBR, formatTimeBR } from '@/lib/dates';
import { formatPhoneBR } from '@/lib/documents';
import { formatNumber, plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { uuidSchema } from '@/lib/validation';
import { formatDateLong } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getCustomerDetail, type CustomerDetail } from '@/server/customers/service';
import { isAppError } from '@/server/errors';
import type { SearchParamsRecord } from '@/server/filters';

export const metadata: Metadata = { title: 'Cliente' };

const ABAS = [
  { chave: 'compras', rotulo: 'Compras' },
  { chave: 'ingressos', rotulo: 'Ingressos' },
  { chave: 'visitas', rotulo: 'Visitas' },
] as const;
type Aba = (typeof ABAS)[number]['chave'];

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const auth = await requirePageAuth();
  if (!can(auth, 'customers.view')) return <NoPermission />;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let cliente: CustomerDetail;
  try {
    cliente = await getCustomerDetail(auth, id);
  } catch (erro) {
    if (isAppError(erro) && erro.code === 'NOT_FOUND') notFound();
    throw erro;
  }

  const pedida = (await searchParams).aba;
  const aba: Aba = ABAS.some((item) => item.chave === pedida) ? (pedida as Aba) : 'compras';
  const fuso = auth.park.timezone;
  const verVendas = can(auth, 'orders.view');
  const verIngressos = can(auth, 'tickets.view');
  const { stats } = cliente;
  const quantidades: Record<Aba, number> = {
    compras: cliente.orders.length,
    ingressos: cliente.tickets.length,
    visitas: cliente.visits.length,
  };

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/clientes"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Clientes
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-pool-700">Cliente</p>
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[30px]">
            {cliente.name}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Cadastrado em {formatDateTimeBR(cliente.createdAt, fuso)}
            {stats.firstOrderAt
              ? ` · primeira compra paga em ${formatDateTimeBR(stats.firstOrderAt, fuso)}`
              : ''}
          </p>
        </div>
        {can(auth, 'customers.manage') ? (
          <EditCustomerDialog
            customer={{
              id: cliente.id,
              name: cliente.name,
              email: cliente.email,
              phone: cliente.phone,
              cpfMasked: cliente.cpfMasked,
              birthDate: cliente.birthDate,
              marketingOptIn: cliente.marketingOptIn,
              notes: cliente.notes,
            }}
          />
        ) : null}
      </div>

      <section
        aria-label="Resumo do cliente"
        className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Total gasto"
          value={formatBRL(stats.totalSpentCents)}
          hint={
            stats.discountCents > 0
              ? `${formatBRL(stats.discountCents)} em descontos`
              : `${plural(stats.ordersCount, 'compra paga', 'compras pagas')}`
          }
          icon={CircleDollarSign}
        />
        <MetricCard
          label="Ticket médio"
          value={stats.averageOrderCents !== null ? formatBRL(stats.averageOrderCents) : 'Sem compras'}
          hint="Total gasto dividido pelas compras pagas"
          icon={ReceiptText}
          tone="grape"
        />
        <MetricCard
          label="Ingressos"
          value={formatNumber(stats.ticketsCount)}
          hint="Ativos e já utilizados"
          icon={Ticket}
          tone="sun"
        />
        <MetricCard
          label="Visitas"
          value={formatNumber(stats.visitsCount)}
          hint={
            stats.nextVisitDate
              ? `próxima em ${formatDateBR(stats.nextVisitDate)}`
              : stats.lastVisitDate
                ? `última em ${formatDateBR(stats.lastVisitDate)}`
                : 'Dias com entrada na portaria'
          }
          icon={CalendarCheck}
          tone="citrus"
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="grid gap-3" aria-label="Histórico do cliente">
          <nav aria-label="Histórico" className="flex gap-1 overflow-x-auto rounded-xl bg-ink-100/70 p-1">
            {ABAS.map((item) => (
              <Link
                key={item.chave}
                href={
                  item.chave === 'compras'
                    ? `/admin/clientes/${id}`
                    : `/admin/clientes/${id}?aba=${item.chave}`
                }
                aria-current={aba === item.chave ? 'page' : undefined}
                scroll={false}
                className={cn(
                  'flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors',
                  aba === item.chave
                    ? 'bg-white text-ink-900 shadow-card'
                    : 'text-ink-600 hover:text-ink-900',
                )}
              >
                {item.rotulo} <span className="tabular text-ink-400">{quantidades[item.chave]}</span>
              </Link>
            ))}
          </nav>

          {aba === 'compras' ? (
            cliente.orders.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Wallet}
                  title="Nenhuma compra"
                  description="Este cliente ainda não comprou ingressos."
                />
              </Card>
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>Pedido</TH>
                      <TH>Compra</TH>
                      <TH>Visita</TH>
                      <TH className="text-right">Ingressos</TH>
                      <TH className="text-right">Valor</TH>
                      <TH>Situação</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {cliente.orders.map((pedido) => (
                      <TR key={pedido.id} className="hover:bg-pool-50/40">
                        <TD className="whitespace-nowrap">
                          {verVendas ? (
                            <Link
                              href={`/admin/vendas/${pedido.id}`}
                              className="font-mono text-[13px] font-semibold text-ink-900 hover:text-pool-800"
                            >
                              {pedido.code}
                            </Link>
                          ) : (
                            <span className="font-mono text-[13px] font-semibold text-ink-900">
                              {pedido.code}
                            </span>
                          )}
                          <div className="mt-1">
                            <ChannelBadge channel={pedido.channel} />
                          </div>
                        </TD>
                        <TD className="whitespace-nowrap text-ink-600">
                          {formatDateTimeBR(pedido.createdAt, fuso)}
                        </TD>
                        <TD className="whitespace-nowrap">{formatDateBR(pedido.visitDate)}</TD>
                        <TD className="tabular text-right">{formatNumber(pedido.ticketsCount)}</TD>
                        <TD className="whitespace-nowrap text-right">
                          <p className="tabular font-semibold">{formatBRL(pedido.totalCents)}</p>
                          {pedido.couponCode ? (
                            <p className="text-xs text-grape-700">cupom {pedido.couponCode}</p>
                          ) : null}
                        </TD>
                        <TD>
                          <SaleStatusBadge status={pedido.saleStatus} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )
          ) : null}

          {aba === 'ingressos' ? (
            cliente.tickets.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Ticket}
                  title="Nenhum ingresso"
                  description="Os ingressos das compras aparecem aqui."
                />
              </Card>
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>Código</TH>
                      <TH>Tipo</TH>
                      <TH>Visita</TH>
                      <TH>Situação</TH>
                      <TH>Entrada</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {cliente.tickets.map((ingresso) => (
                      <TR key={ingresso.id} className="hover:bg-pool-50/40">
                        <TD className="whitespace-nowrap">
                          {verIngressos ? (
                            <Link
                              href={`/admin/ingressos/${ingresso.id}`}
                              className="font-mono text-[13px] font-semibold text-ink-900 hover:text-pool-800"
                            >
                              {ingresso.code}
                            </Link>
                          ) : (
                            <span className="font-mono text-[13px] font-semibold text-ink-900">
                              {ingresso.code}
                            </span>
                          )}
                          <p className="text-xs text-ink-500">pedido {ingresso.orderCode}</p>
                        </TD>
                        <TD>
                          <p className="text-ink-800">{ingresso.typeName}</p>
                          {ingresso.holderName ? (
                            <p className="text-xs text-ink-500">{ingresso.holderName}</p>
                          ) : null}
                        </TD>
                        <TD className="whitespace-nowrap">{formatDateBR(ingresso.visitDate)}</TD>
                        <TD>
                          <TicketStatusBadge status={ingresso.status} />
                        </TD>
                        <TD className="whitespace-nowrap text-ink-600">
                          {ingresso.checkedInAt ? formatTimeBR(ingresso.checkedInAt, fuso) : 'Não entrou'}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )
          ) : null}

          {aba === 'visitas' ? (
            <Card>
              {cliente.visits.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title="Nenhuma visita registrada"
                  description="A visita é contada quando a entrada é liberada na portaria."
                />
              ) : (
                <ul className="divide-y divide-ink-100 px-5 sm:px-6">
                  {cliente.visits.map((visita) => (
                    <li
                      key={visita.date}
                      className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                    >
                      <div>
                        <p className="font-semibold text-ink-900 capitalize-first">
                          {formatDateLong(visita.date)}
                        </p>
                        <p className="text-[13px] text-ink-500">
                          {visita.firstEntryAt
                            ? `Primeira entrada às ${formatTimeBR(visita.firstEntryAt, fuso)}`
                            : ''}
                        </p>
                      </div>
                      <Badge tone="info">{plural(visita.entries, 'entrada', 'entradas')}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </section>

        <div className="grid gap-6">
          <Card>
            <CardHeader title="Dados do cliente" />
            <CardContent className="grid gap-3 pt-3 text-sm">
              {cliente.phone ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <a
                    href={`tel:+${cliente.phone}`}
                    className="flex items-center gap-2.5 text-ink-700 hover:text-pool-800"
                  >
                    <Phone className="size-4 text-ink-400" aria-hidden />
                    {formatPhoneBR(cliente.phone)}
                  </a>
                  <a
                    href={`https://wa.me/${cliente.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-success-700 hover:text-success-800"
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    WhatsApp
                  </a>
                </div>
              ) : (
                <p className="flex items-center gap-2.5 text-ink-500">
                  <Phone className="size-4 text-ink-400" aria-hidden />
                  Sem WhatsApp cadastrado
                </p>
              )}
              {cliente.email ? (
                <a
                  href={`mailto:${cliente.email}`}
                  className="flex items-center gap-2.5 break-all text-ink-700 hover:text-pool-800"
                >
                  <Mail className="size-4 shrink-0 text-ink-400" aria-hidden />
                  {cliente.email}
                </a>
              ) : (
                <p className="flex items-center gap-2.5 text-ink-500">
                  <Mail className="size-4 shrink-0 text-ink-400" aria-hidden />
                  Sem e-mail cadastrado
                </p>
              )}
              <dl className="mt-1 grid gap-2 border-t border-ink-100 pt-3">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">CPF</dt>
                  <dd className="font-medium text-ink-900">{cliente.cpfMasked ?? 'Não informado'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Nascimento</dt>
                  <dd className="font-medium text-ink-900">
                    {cliente.birthDate ? formatDateBR(cliente.birthDate) : 'Não informado'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Última visita</dt>
                  <dd className="font-medium text-ink-900">
                    {stats.lastVisitDate ? formatDateBR(stats.lastVisitDate) : 'Nenhuma'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Comunicações</dt>
                  <dd>
                    {cliente.marketingOptIn ? (
                      <Badge tone="success">Aceita</Badge>
                    ) : (
                      <Badge tone="neutral">Não autorizou</Badge>
                    )}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Observações internas" />
            <CardContent className="pt-3">
              {cliente.notes ? (
                <p className="whitespace-pre-line text-sm leading-6 text-ink-700">{cliente.notes}</p>
              ) : (
                <p className="text-sm text-ink-500">Nenhuma observação.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
