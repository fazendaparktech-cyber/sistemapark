import 'server-only';

import { dateOnlyOf, dbToDateOnly, formatDateBR, formatTimeBR } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { formatDateLong } from '@/lib/weekdays';

import { prisma, type DbClient } from '../db';
import { env } from '../env';
import { emailProvider } from '../integrations/email';
import {
  orderCancelledEmail,
  orderConfirmedEmail,
  orderReceivedEmail,
  type OrderEmailInfo,
  type RenderedEmail,
} from '../integrations/email/templates';
import { orderAccessToken } from '../signing';

/**
 * E-mails do pedido. Falha no envio nunca desfaz a venda: quem chama registra
 * o erro e segue — o cliente sempre pode abrir o pedido pelo link ou pedir
 * os links de novo em "Meus ingressos".
 */

export function orderPublicPath(pedido: { id: string; code: string; accessVersion: number }): string {
  return `/pedido/${encodeURIComponent(pedido.code)}?t=${orderAccessToken(pedido)}`;
}

export function orderPublicUrl(pedido: { id: string; code: string; accessVersion: number }): string {
  return `${env().APP_URL}${orderPublicPath(pedido)}`;
}

function carregar(db: DbClient, orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      park: { select: { name: true, timezone: true, addressLine: true, city: true, state: true } },
      parkDay: { select: { opensAt: true, closesAt: true } },
      _count: { select: { tickets: true } },
    },
  });
}

type PedidoParaEmail = NonNullable<Awaited<ReturnType<typeof carregar>>>;

function informacoes(pedido: PedidoParaEmail): OrderEmailInfo {
  const cidade =
    pedido.park.city && pedido.park.state ? `${pedido.park.city} - ${pedido.park.state}` : pedido.park.city;
  const endereco = [pedido.park.addressLine, cidade].filter(Boolean).join(', ');
  return {
    parkName: pedido.park.name,
    buyerName: pedido.buyerName,
    code: pedido.code,
    visitDate: formatDateLong(dbToDateOnly(pedido.visitDate)),
    hours:
      pedido.parkDay.opensAt && pedido.parkDay.closesAt
        ? `das ${pedido.parkDay.opensAt} às ${pedido.parkDay.closesAt}`
        : null,
    ticketsCount: pedido._count.tickets,
    total: formatBRL(pedido.totalCents),
    url: orderPublicUrl(pedido),
    address: endereco || null,
  };
}

async function enviar(
  para: string,
  email: RenderedEmail,
  tag: string,
  idempotencyKey?: string,
): Promise<void> {
  await emailProvider().send({
    to: para,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tag,
    idempotencyKey,
  });
}

/** Ingressos liberados. Com `resend`, envia de novo mesmo que já tenha sido enviado. */
export async function sendOrderConfirmedEmail(
  orderId: string,
  db: DbClient = prisma,
  options: { resend?: boolean } = {},
): Promise<boolean> {
  const pedido = await carregar(db, orderId);
  if (!pedido || pedido.status !== 'CONFIRMED') return false;
  await enviar(
    pedido.buyerEmail,
    orderConfirmedEmail(informacoes(pedido)),
    'order_confirmed',
    options.resend ? undefined : `pedido-confirmado-${pedido.id}`,
  );
  return true;
}

/** Pedido criado, aguardando o PIX. */
export async function sendOrderReceivedEmail(
  orderId: string,
  db: DbClient = prisma,
  options: { resend?: boolean } = {},
): Promise<boolean> {
  const pedido = await carregar(db, orderId);
  if (!pedido || pedido.status !== 'PENDING_PAYMENT' || !pedido.expiresAt || pedido.expiresAt <= new Date()) {
    return false;
  }
  const fuso = pedido.park.timezone;
  const payUntil = `as ${formatTimeBR(pedido.expiresAt, fuso)} do dia ${formatDateBR(dateOnlyOf(pedido.expiresAt, fuso))}`;
  await enviar(
    pedido.buyerEmail,
    orderReceivedEmail({ ...informacoes(pedido), payUntil }),
    'order_received',
    options.resend ? undefined : `pedido-recebido-${pedido.id}`,
  );
  return true;
}

export async function sendOrderCancelledEmail(
  orderId: string,
  refundedCents: number | null,
  db: DbClient = prisma,
): Promise<boolean> {
  const pedido = await carregar(db, orderId);
  if (!pedido) return false;
  const info = informacoes(pedido);
  await enviar(
    pedido.buyerEmail,
    orderCancelledEmail({
      parkName: info.parkName,
      buyerName: info.buyerName,
      code: info.code,
      visitDate: info.visitDate,
      refundedAmount: refundedCents ? formatBRL(refundedCents) : null,
    }),
    refundedCents ? 'order_refunded' : 'order_cancelled',
    `pedido-cancelado-${pedido.id}`,
  );
  return true;
}
