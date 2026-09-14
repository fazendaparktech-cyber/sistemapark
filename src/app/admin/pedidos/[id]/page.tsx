import { ArrowLeft, Mail, MessageCircle, Phone, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { NoPermission } from '@/components/admin/no-permission';
import { OrderActions } from '@/components/admin/orders/order-actions';
import {
  ChannelBadge,
  FinancialStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  TicketStatusBadge,
} from '@/components/admin/status-badges';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import type { Prisma } from '@/generated/prisma/client';
import { auditActionLabel, auditActorFallback } from '@/lib/audit-labels';
import { formatDateBR, formatDateTimeBR, formatTimeBR } from '@/lib/dates';
import { formatPhoneBR } from '@/lib/documents';
import { formatNumber, plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type PaymentStatusKey } from '@/lib/orders';
import { uuidSchema } from '@/lib/validation';
import { formatDateLong } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { isAppError } from '@/server/errors';
import { getOrderAdmin, type AdminOrderDetail } from '@/server/orders/admin';

export const metadata: Metadata = { title: 'Pedido' };

const TRANSACOES: Record<AdminOrderDetail['payments'][number]['transactions'][number]['kind'], string> = {
  CREATED: 'Cobrança criada',
  STATUS_CHANGED: 'Situação alterada',
  WEBHOOK: 'Aviso do provedor',
  RECONCILED: 'Consulta ao provedor',
  ERROR: 'Divergência',
};

function detalheDoRegistro(acao: string, dados: Prisma.JsonValue | null): string | null {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  if (typeof d.reason === 'string' && acao !== 'orders.confirmed') return `Motivo: ${d.reason}`;
  if (acao === 'orders.created' && typeof d.totalCents === 'number' && typeof d.tickets === 'number') {
    return `${plural(d.tickets, 'ingresso', 'ingressos')}, total ${formatBRL(d.totalCents)}${
      typeof d.coupon === 'string' ? `, cupom ${d.coupon}` : ''
    }`;
  }
  if (acao === 'orders.email_resent' && typeof d.to === 'string') return `Enviado para ${d.to}`;
  if (acao === 'payments.reconciled' && typeof d.status === 'string' && d.status in PAYMENT_STATUS_LABELS) {
    return `Situação no provedor: ${PAYMENT_STATUS_LABELS[d.status as PaymentStatusKey].toLowerCase()}`;
  }
  if (acao === 'orders.confirmed' && typeof d.reason === 'string') return d.reason;
  return null;
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-ink-500">{rotulo}</dt>
      <dd className="min-w-0 text-right font-medium text-ink-900">{children}</dd>
    </div>
  );
}

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  if (!can(auth, 'orders.view')) return <NoPermission />;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let pedido: AdminOrderDetail;
  try {
    pedido = await getOrderAdmin(auth, id);
  } catch (erro) {
    if (isAppError(erro) && erro.code === 'NOT_FOUND') notFound();
    throw erro;
  }

  const fuso = auth.park.timezone;
  const agora = new Date();
  const pagamentoEmAberto = pedido.payments.find(
    (pagamento) =>
      pagamento.providerPaymentId && (pagamento.status === 'AWAITING' || pagamento.status === 'PROCESSING'),
  );
  const whatsapp = pedido.buyer.phone ? `https://wa.me/${pedido.buyer.phone}` : null;
  const temOrigem = Object.values(pedido.attribution).some(Boolean);
  const utilizados = pedido.tickets.filter((ingresso) => ingresso.status === 'CHECKED_IN').length;

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/pedidos"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Pedidos
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-pool-700">Pedido</p>
          <h1 className="font-mono text-[26px] font-semibold tracking-tight text-ink-900 sm:text-[30px]">
            {pedido.code}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Criado em {formatDateTimeBR(pedido.createdAt, fuso)}
            {pedido.soldByName ? ` por ${pedido.soldByName}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <OrderStatusBadge status={pedido.status} />
            <FinancialStatusBadge status={pedido.financialStatus} />
            <ChannelBadge channel={pedido.channel} />
            {pedido.coupon ? <Badge tone="grape">Cupom {pedido.coupon.code}</Badge> : null}
          </div>
        </div>
        <OrderActions
          orderId={pedido.id}
          code={pedido.code}
          totalLabel={formatBRL(pedido.totalCents)}
          publicUrl={pedido.publicUrl}
          reconcilePaymentId={pagamentoEmAberto?.id ?? null}
          actions={pedido.actions}
        />
      </div>

      {pedido.needsRefund ? (
        <Alert tone="warning" title="Pagamento recebido sem ingresso liberado">
          O pagamento entrou fora do prazo, quando não havia mais vaga, ou depois do cancelamento. Faça o
          reembolso ao cliente.
        </Alert>
      ) : null}
      {pedido.status === 'PENDING_PAYMENT' && pedido.expiresAt ? (
        <Alert tone="info" title="Aguardando pagamento">
          O PIX vale até as {formatTimeBR(pedido.expiresAt, fuso)} de{' '}
          {formatDateBR(pedido.expiresAt.toISOString().slice(0, 10))}. Depois disso o pedido vence e as vagas
          voltam para venda.
        </Alert>
      ) : null}
      {pedido.cancelledAt ? (
        <Alert
          tone="danger"
          title={pedido.financialStatus === 'REFUNDED' ? 'Pedido reembolsado' : 'Pedido cancelado'}
        >
          Em {formatDateTimeBR(pedido.cancelledAt, fuso)}
          {pedido.cancelledByName ? ` por ${pedido.cancelledByName}` : ''}
          {pedido.cancelReason ? `. Motivo: ${pedido.cancelReason}` : '.'}
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <Card>
            <CardHeader title="Itens" />
            <CardContent className="pt-3">
              <TableContainer className="shadow-none">
                <Table>
                  <THead>
                    <tr>
                      <TH>Ingresso</TH>
                      <TH className="text-right">Qtd.</TH>
                      <TH className="text-right">Unitário</TH>
                      <TH className="text-right">Total</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {pedido.items.map((item) => (
                      <TR key={item.id}>
                        <TD>
                          <p className="font-medium text-ink-900">{item.name}</p>
                          {item.priceLabel ? (
                            <p className="text-xs text-ink-500">Preço: {item.priceLabel}</p>
                          ) : null}
                        </TD>
                        <TD className="tabular text-right">{formatNumber(item.quantity)}</TD>
                        <TD className="tabular whitespace-nowrap text-right">
                          {formatBRL(item.unitPriceCents)}
                        </TD>
                        <TD className="whitespace-nowrap text-right">
                          <p className="tabular font-semibold">{formatBRL(item.totalCents)}</p>
                          {item.discountCents > 0 ? (
                            <p className="tabular text-xs text-grape-700">-{formatBRL(item.discountCents)}</p>
                          ) : null}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
              <dl className="ml-auto mt-4 grid max-w-xs divide-y divide-ink-100">
                <Linha rotulo="Subtotal">
                  <span className="tabular">{formatBRL(pedido.subtotalCents)}</span>
                </Linha>
                {pedido.discountCents > 0 ? (
                  <Linha rotulo={pedido.coupon ? `Desconto (${pedido.coupon.code})` : 'Desconto'}>
                    <span className="tabular text-grape-700">-{formatBRL(pedido.discountCents)}</span>
                  </Linha>
                ) : null}
                <Linha rotulo="Total">
                  <span className="tabular text-base font-semibold">{formatBRL(pedido.totalCents)}</span>
                </Linha>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title={`Ingressos (${pedido.tickets.length})`}
              description={
                utilizados > 0
                  ? `${plural(utilizados, 'entrada registrada', 'entradas registradas')} na portaria`
                  : undefined
              }
            />
            <CardContent className="pt-3">
              <ul className="divide-y divide-ink-100">
                {pedido.tickets.map((ingresso) => (
                  <li key={ingresso.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">
                        {ingresso.holderName ?? 'Visitante sem nome informado'}
                      </p>
                      <p className="text-[13px] text-ink-500">
                        {ingresso.typeName} · <span className="font-mono">{ingresso.code}</span>
                        {ingresso.holderCpfMasked ? ` · CPF ${ingresso.holderCpfMasked}` : ''}
                        {ingresso.holderBirthDate ? ` · nasc. ${formatDateBR(ingresso.holderBirthDate)}` : ''}
                      </p>
                      {ingresso.checkedInAt ? (
                        <p className="text-xs text-ink-500">
                          Entrou em {formatDateTimeBR(ingresso.checkedInAt, fuso)}
                          {ingresso.checkedInByName ? ` · liberado por ${ingresso.checkedInByName}` : ''}
                        </p>
                      ) : null}
                    </div>
                    <TicketStatusBadge status={ingresso.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Pagamentos" />
            <CardContent className="pt-3">
              {pedido.payments.length === 0 ? (
                <p className="text-sm text-ink-500">
                  {pedido.financialStatus === 'NOT_APPLICABLE'
                    ? 'Pedido sem valor a pagar.'
                    : 'Nenhuma cobrança gerada para este pedido.'}
                </p>
              ) : (
                <ul className="grid gap-4">
                  {pedido.payments.map((pagamento) => (
                    <li key={pagamento.id} className="rounded-xl p-4 ring-1 ring-inset ring-ink-200/80">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink-900">
                            {PAYMENT_METHOD_LABELS[pagamento.method]}{' '}
                            <span className="tabular">{formatBRL(pagamento.amountCents)}</span>
                          </p>
                          <p className="text-[13px] text-ink-500">
                            {pagamento.provider === 'MOCK' ? 'Provedor de teste' : 'Asaas'} · criado em{' '}
                            {formatDateTimeBR(pagamento.createdAt, fuso)}
                          </p>
                        </div>
                        <PaymentStatusBadge status={pagamento.status} />
                      </div>
                      <dl className="mt-2 grid gap-x-6 text-[13px] sm:grid-cols-2">
                        {pagamento.approvedAt ? (
                          <Linha rotulo="Aprovado em">{formatDateTimeBR(pagamento.approvedAt, fuso)}</Linha>
                        ) : null}
                        {pagamento.refundedCents > 0 ? (
                          <Linha rotulo="Reembolsado">
                            <span className="tabular">{formatBRL(pagamento.refundedCents)}</span>
                          </Linha>
                        ) : null}
                        {pagamento.feeCents !== null ? (
                          <Linha rotulo="Taxa">
                            <span className="tabular">{formatBRL(pagamento.feeCents)}</span>
                          </Linha>
                        ) : null}
                        {pagamento.providerPaymentId ? (
                          <Linha rotulo="Id no provedor">
                            <span className="break-all font-mono text-xs">{pagamento.providerPaymentId}</span>
                          </Linha>
                        ) : null}
                      </dl>
                      {pagamento.transactions.length > 0 ? (
                        <details className="mt-2 group">
                          <summary className="cursor-pointer text-[13px] font-semibold text-pool-700 hover:text-pool-800">
                            {plural(pagamento.transactions.length, 'movimentação', 'movimentações')}
                          </summary>
                          <ul className="mt-2 grid gap-1.5 text-[13px] text-ink-600">
                            {pagamento.transactions.map((transacao) => (
                              <li key={transacao.id} className="flex flex-wrap justify-between gap-2">
                                <span>
                                  {TRANSACOES[transacao.kind]}
                                  {transacao.toStatus
                                    ? `: ${PAYMENT_STATUS_LABELS[transacao.toStatus].toLowerCase()}`
                                    : ''}
                                </span>
                                <span className="tabular text-ink-500">
                                  {formatDateTimeBR(transacao.createdAt, fuso)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader
              title="Comprador"
              action={
                pedido.customer && can(auth, 'customers.view') ? (
                  <Link
                    href={`/admin/clientes/${pedido.customer.id}`}
                    className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                  >
                    Ver cliente
                  </Link>
                ) : null
              }
            />
            <CardContent className="grid gap-3 pt-3 text-sm">
              <p className="flex items-center gap-2.5 font-semibold text-ink-900">
                <UserRound className="size-4 text-ink-400" aria-hidden />
                {pedido.buyer.name}
              </p>
              <a
                href={`mailto:${pedido.buyer.email}`}
                className="flex items-center gap-2.5 break-all text-ink-700 hover:text-pool-800"
              >
                <Mail className="size-4 shrink-0 text-ink-400" aria-hidden />
                {pedido.buyer.email}
              </a>
              {pedido.buyer.phone ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <a
                    href={`tel:+${pedido.buyer.phone}`}
                    className="flex items-center gap-2.5 text-ink-700 hover:text-pool-800"
                  >
                    <Phone className="size-4 text-ink-400" aria-hidden />
                    {formatPhoneBR(pedido.buyer.phone)}
                  </a>
                  {whatsapp ? (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-[13px] font-semibold text-success-700 hover:text-success-800"
                    >
                      <MessageCircle className="size-4" aria-hidden />
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              ) : null}
              {pedido.buyer.cpfMasked ? <p className="text-ink-500">CPF {pedido.buyer.cpfMasked}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Visita" />
            <CardContent className="pt-3">
              <p className="font-semibold capitalize-first text-ink-900">
                {formatDateLong(pedido.visitDate)}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {pedido.day.opensAt && pedido.day.closesAt
                  ? `Das ${pedido.day.opensAt} às ${pedido.day.closesAt}`
                  : 'Horário não informado'}
                {pedido.day.label ? ` · ${pedido.day.label}` : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Origem da compra" />
            <CardContent className="pt-3">
              {temOrigem ? (
                <dl className="divide-y divide-ink-100">
                  {pedido.attribution.utmSource ? (
                    <Linha rotulo="Origem">{pedido.attribution.utmSource}</Linha>
                  ) : null}
                  {pedido.attribution.utmMedium ? (
                    <Linha rotulo="Mídia">{pedido.attribution.utmMedium}</Linha>
                  ) : null}
                  {pedido.attribution.utmCampaign ? (
                    <Linha rotulo="Campanha">{pedido.attribution.utmCampaign}</Linha>
                  ) : null}
                  {pedido.attribution.utmContent ? (
                    <Linha rotulo="Conteúdo">{pedido.attribution.utmContent}</Linha>
                  ) : null}
                  {pedido.attribution.utmTerm ? (
                    <Linha rotulo="Termo">{pedido.attribution.utmTerm}</Linha>
                  ) : null}
                  {pedido.attribution.referrer ? (
                    <Linha rotulo="Veio de">
                      <span className="break-all text-xs">{pedido.attribution.referrer}</span>
                    </Linha>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-ink-500">
                  {pedido.channel === 'ONLINE'
                    ? 'Acesso direto ao site, sem campanha.'
                    : 'Venda feita pela equipe.'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Histórico" />
            <CardContent className="pt-3">
              {pedido.timeline.length === 0 ? (
                <p className="text-sm text-ink-500">Sem registros.</p>
              ) : (
                <ol className="relative grid gap-4 border-l border-ink-200 pl-5">
                  {pedido.timeline.map((registro) => {
                    const detalhe = detalheDoRegistro(registro.action, registro.data);
                    return (
                      <li key={registro.id} className="relative">
                        <span
                          aria-hidden
                          className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-white ring-2 ring-pool-500"
                        />
                        <p className="text-sm font-medium text-ink-900">
                          {auditActionLabel(registro.action)}
                        </p>
                        <p className="text-xs text-ink-500">
                          {formatDateTimeBR(registro.at, fuso)} ·{' '}
                          {registro.actorName ?? auditActorFallback(registro.action, registro.actorType)}
                        </p>
                        {detalhe ? <p className="mt-0.5 text-[13px] text-ink-600">{detalhe}</p> : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          {can(auth, 'audit.view') && (pedido.createdIp || pedido.userAgent) ? (
            <details className="rounded-2xl bg-white px-5 py-4 text-sm shadow-card ring-1 ring-ink-200/70">
              <summary className="cursor-pointer font-semibold text-ink-700">
                Dados técnicos da compra
              </summary>
              <dl className="mt-2 divide-y divide-ink-100">
                {pedido.createdIp ? <Linha rotulo="IP">{pedido.createdIp}</Linha> : null}
                {pedido.userAgent ? (
                  <Linha rotulo="Navegador">
                    <span className="break-all text-xs font-normal">{pedido.userAgent}</span>
                  </Linha>
                ) : null}
                <Linha rotulo="Consultado em">{formatDateTimeBR(agora, fuso)}</Linha>
              </dl>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
