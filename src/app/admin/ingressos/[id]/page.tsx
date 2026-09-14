import { ArrowLeft, CircleCheck, CircleX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { NoPermission } from '@/components/admin/no-permission';
import { ChannelBadge, SaleStatusBadge, TicketStatusBadge } from '@/components/admin/status-badges';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import { formatPhoneBR } from '@/lib/documents';
import { formatBRL } from '@/lib/money';
import { CHECKIN_METHOD_LABELS, CHECKIN_REASON_LABELS, TICKET_EVENT_LABELS } from '@/lib/tickets';
import { uuidSchema } from '@/lib/validation';
import { formatDateLong } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { isAppError } from '@/server/errors';
import { getTicketAdmin, type TicketDetail } from '@/server/tickets/service';

export const metadata: Metadata = { title: 'Ingresso' };

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-ink-500">{rotulo}</dt>
      <dd className="min-w-0 text-right font-medium text-ink-900">{children}</dd>
    </div>
  );
}

function detalheDoEvento(dados: unknown): string | null {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  if (d.channel === 'whatsapp') return 'Pelo WhatsApp';
  if (d.channel === 'email') return 'Por e-mail';
  if (d.method === 'QR') return 'Leitura do QR Code';
  if (d.method === 'MANUAL') return 'Liberado pela busca';
  if (typeof d.reason === 'string') return `Motivo: ${d.reason}`;
  return null;
}

function mensagemSemQr(ingresso: TicketDetail, fuso: string): string {
  switch (ingresso.status) {
    case 'CHECKED_IN':
      return ingresso.checkedInAt
        ? `Entrada registrada em ${formatDateTimeBR(ingresso.checkedInAt, fuso)}. O QR Code não vale mais.`
        : 'Entrada já registrada. O QR Code não vale mais.';
    case 'PENDING_PAYMENT':
      return 'O QR Code aparece quando o pagamento for confirmado.';
    case 'EXPIRED':
      return 'A data da visita passou sem entrada registrada.';
    case 'REFUNDED':
      return 'O valor foi devolvido e o ingresso não vale mais.';
    default:
      return 'Ingresso cancelado. O QR Code não vale mais.';
  }
}

export default async function IngressoPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  if (!can(auth, 'tickets.view')) return <NoPermission />;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let ingresso: TicketDetail;
  try {
    ingresso = await getTicketAdmin(auth, id);
  } catch (erro) {
    if (isAppError(erro) && erro.code === 'NOT_FOUND') notFound();
    throw erro;
  }
  const fuso = auth.park.timezone;

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/ingressos"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Ingressos
      </Link>

      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-pool-700">{ingresso.typeName}</p>
        <h1 className="font-mono text-[26px] font-semibold tracking-tight text-ink-900 sm:text-[30px]">
          {ingresso.code}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {ingresso.holderName ?? ingresso.buyerName} · visita em{' '}
          <span className="capitalize-first">{formatDateLong(ingresso.visitDate)}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <TicketStatusBadge status={ingresso.status} />
          <ChannelBadge channel={ingresso.channel} />
          {ingresso.isCourtesy ? <Badge tone="citrus">Cortesia</Badge> : null}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="grid gap-6">
          <Card>
            <CardHeader title="QR Code" />
            <CardContent className="grid justify-items-center gap-4 pt-4 text-center">
              {ingresso.qrSvg ? (
                <>
                  <div
                    role="img"
                    aria-label={`QR Code do ingresso ${ingresso.code}`}
                    className="size-56 rounded-2xl bg-white p-2 ring-1 ring-ink-200 [&_svg]:size-full"
                    dangerouslySetInnerHTML={{ __html: ingresso.qrSvg }}
                  />
                  <p className="max-w-xs text-sm text-ink-500">
                    Único para este ingresso e assinado pelo sistema. Libera uma entrada, na data da visita.
                  </p>
                </>
              ) : (
                <p className="max-w-xs py-6 text-sm text-ink-600">{mensagemSemQr(ingresso, fuso)}</p>
              )}
              {ingresso.publicUrl ? (
                <CopyButton value={ingresso.publicUrl} label="Copiar link dos ingressos" />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Dados do ingresso" />
            <CardContent className="pt-2">
              <dl className="divide-y divide-ink-100">
                <Linha rotulo="Visitante">{ingresso.holderName ?? 'Sem nome informado'}</Linha>
                {ingresso.holderCpfMasked ? <Linha rotulo="CPF">{ingresso.holderCpfMasked}</Linha> : null}
                {ingresso.holderBirthDate ? (
                  <Linha rotulo="Nascimento">{formatDateBR(ingresso.holderBirthDate)}</Linha>
                ) : null}
                <Linha rotulo="Tipo">{ingresso.typeName}</Linha>
                <Linha rotulo="Data da visita">{formatDateBR(ingresso.visitDate)}</Linha>
                <Linha rotulo="Valor">
                  <span className="tabular">
                    {ingresso.isCourtesy ? 'Cortesia' : formatBRL(ingresso.priceCents)}
                  </span>
                </Linha>
                <Linha rotulo="Entrada">
                  {ingresso.checkedInAt ? formatDateTimeBR(ingresso.checkedInAt, fuso) : 'Não registrada'}
                </Linha>
                <Linha rotulo="Emitido em">{formatDateTimeBR(ingresso.createdAt, fuso)}</Linha>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Pedido"
              action={
                can(auth, 'orders.view') ? (
                  <Link
                    href={`/admin/vendas/${ingresso.order.id}`}
                    className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                  >
                    Ver venda
                  </Link>
                ) : null
              }
            />
            <CardContent className="pt-2">
              <dl className="divide-y divide-ink-100">
                <Linha rotulo="Número">
                  <span className="font-mono">{ingresso.order.code}</span>
                </Linha>
                <Linha rotulo="Situação">
                  <SaleStatusBadge status={ingresso.order.saleStatus} />
                </Linha>
                <Linha rotulo="Cliente">
                  {ingresso.customer && can(auth, 'customers.view') ? (
                    <Link
                      href={`/admin/clientes/${ingresso.customer.id}`}
                      className="text-pool-700 hover:text-pool-800"
                    >
                      {ingresso.customer.name}
                    </Link>
                  ) : (
                    ingresso.buyerName
                  )}
                </Linha>
                {ingresso.buyerPhone ? (
                  <Linha rotulo="Celular">{formatPhoneBR(ingresso.buyerPhone)}</Linha>
                ) : null}
                {ingresso.order.buyerEmail ? (
                  <Linha rotulo="E-mail">
                    <span className="break-all">{ingresso.order.buyerEmail}</span>
                  </Linha>
                ) : null}
                <Linha rotulo="Total do pedido">
                  <span className="tabular">{formatBRL(ingresso.order.totalCents)}</span>
                </Linha>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader
              title="Tentativas de entrada"
              description="Cada leitura na portaria, liberada ou negada."
            />
            <CardContent className="pt-3">
              {ingresso.attempts.length === 0 ? (
                <p className="text-sm text-ink-500">Nenhuma leitura deste ingresso na portaria.</p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {ingresso.attempts.map((tentativa) => (
                    <li key={tentativa.id} className="flex items-start gap-3 py-3">
                      {tentativa.allowed ? (
                        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-700" aria-hidden />
                      ) : (
                        <CircleX className="mt-0.5 size-5 shrink-0 text-danger-700" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-900">
                          {tentativa.allowed
                            ? 'Entrada liberada'
                            : tentativa.reason
                              ? CHECKIN_REASON_LABELS[tentativa.reason]
                              : 'Entrada negada'}
                        </p>
                        <p className="text-[13px] text-ink-500">
                          {formatDateTimeBR(tentativa.at, fuso)} · {CHECKIN_METHOD_LABELS[tentativa.method]}
                          {tentativa.operatorName ? ` · ${tentativa.operatorName}` : ''}
                          {tentativa.device ? ` · ${tentativa.device}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Histórico" />
            <CardContent className="pt-3">
              <ol className="relative grid gap-4 border-l border-ink-200 pl-5">
                {ingresso.events.map((evento) => {
                  const detalhe = detalheDoEvento(evento.data);
                  return (
                    <li key={evento.id} className="relative">
                      <span
                        aria-hidden
                        className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-white ring-2 ring-pool-500"
                      />
                      <p className="text-sm font-medium text-ink-900">
                        {TICKET_EVENT_LABELS[evento.type] ?? evento.type}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatDateTimeBR(evento.at, fuso)}
                        {evento.actorName ? ` · ${evento.actorName}` : ''}
                      </p>
                      {detalhe ? <p className="mt-0.5 text-[13px] text-ink-600">{detalhe}</p> : null}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
