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
import { ChannelBadge, OrderStatusBadge } from '@/components/admin/status-badges';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, formatDateTimeBR, todayIn } from '@/lib/dates';
import { formatPhoneBR } from '@/lib/documents';
import { formatNumber } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { uuidSchema } from '@/lib/validation';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getCustomerDetail, type CustomerDetail } from '@/server/customers/service';
import { isAppError } from '@/server/errors';

export const metadata: Metadata = { title: 'Cliente' };

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
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

  const fuso = auth.park.timezone;
  const hoje = todayIn(fuso);
  const verPedidos = can(auth, 'orders.view');
  const { stats } = cliente;
  const proximaVisita = stats.lastVisitDate && stats.lastVisitDate >= hoje;

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
        <MetricCard label="Em compras" value={formatBRL(stats.totalSpentCents)} icon={CircleDollarSign} />
        <MetricCard
          label="Pedidos pagos"
          value={formatNumber(stats.ordersCount)}
          hint={
            stats.averageOrderCents !== null
              ? `valor médio ${formatBRL(stats.averageOrderCents)}`
              : 'Nenhuma compra paga'
          }
          icon={ReceiptText}
          tone="grape"
        />
        <MetricCard
          label="Ingressos"
          value={formatNumber(stats.ticketsCount)}
          hint={
            stats.discountCents > 0
              ? `${formatBRL(stats.discountCents)} em descontos`
              : 'válidos e utilizados'
          }
          icon={Ticket}
          tone="sun"
        />
        <MetricCard
          label="Visitas registradas"
          value={formatNumber(stats.visitsCount)}
          hint={
            stats.lastVisitDate
              ? proximaVisita
                ? `próxima visita em ${formatDateBR(stats.lastVisitDate)}`
                : `última em ${formatDateBR(stats.lastVisitDate)}`
              : 'dias com entrada na portaria'
          }
          icon={CalendarCheck}
          tone="citrus"
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="grid gap-3" aria-labelledby="pedidos-do-cliente">
          <h2 id="pedidos-do-cliente" className="font-display text-[17px] font-semibold text-ink-900">
            Pedidos
          </h2>
          {cliente.orders.length === 0 ? (
            <Card>
              <EmptyState
                icon={Wallet}
                title="Nenhum pedido"
                description="Este cliente ainda não fez pedidos."
              />
            </Card>
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Pedido</TH>
                    <TH>Visita</TH>
                    <TH className="text-right">Ingressos</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Situação</TH>
                  </tr>
                </THead>
                <TBody>
                  {cliente.orders.map((pedido) => (
                    <TR key={pedido.id} className="hover:bg-pool-50/40">
                      <TD className="whitespace-nowrap">
                        {verPedidos ? (
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
                      <TD className="whitespace-nowrap">{formatDateBR(pedido.visitDate)}</TD>
                      <TD className="tabular text-right">{formatNumber(pedido.ticketsCount)}</TD>
                      <TD className="whitespace-nowrap text-right">
                        <p className="tabular font-semibold">{formatBRL(pedido.totalCents)}</p>
                        {pedido.couponCode ? (
                          <p className="text-xs text-grape-700">cupom {pedido.couponCode}</p>
                        ) : null}
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

        <div className="grid gap-6">
          <Card>
            <CardHeader title="Contato" />
            <CardContent className="grid gap-3 pt-3 text-sm">
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
                <p className="text-ink-400">Sem celular cadastrado</p>
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
