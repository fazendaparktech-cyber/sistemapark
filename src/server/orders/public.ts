import 'server-only';

import QRCode from 'qrcode';

import { dbToDateOnly, type DateOnly } from '@/lib/dates';
import {
  effectiveOrderStatus,
  normalizeOrderCode,
  ORDER_STATUS_LABELS,
  type FinancialStatusKey,
  type OrderStatusKey,
  type PaymentStatusKey,
  type TicketStatusKey,
} from '@/lib/orders';
import { emailSchema } from '@/lib/validation';
import { formatDateLong } from '@/lib/weekdays';

import { consumeRateLimit, enforceRateLimit, rateLimitKey } from '../rate-limit';
import { prisma, type DbClient } from '../db';
import { fromZodError } from '../errors';
import { emailProvider } from '../integrations/email';
import { orderLinksEmail } from '../integrations/email/templates';
import type { PublicPark } from '../parks/public';
import { paymentSimulationEnabled } from '../payments/service';
import type { RequestMeta } from '../request';
import { isOrderAccessTokenValid, ticketQrPayload } from '../signing';
import { orderPublicUrl } from './emails';

/**
 * O pedido visto pelo cliente, aberto pelo link com token. Sem o token certo,
 * o pedido "não existe" — o número do pedido sozinho não dá acesso a nada.
 */

export interface PublicOrderTicket {
  code: string;
  typeName: string;
  holderName: string | null;
  status: TicketStatusKey;
  checkedInAt: Date | null;
  /** QR Code em SVG, só para ingresso válido de pedido confirmado. */
  qrSvg: string | null;
}

export interface PublicOrderView {
  id: string;
  code: string;
  status: OrderStatusKey;
  financialStatus: FinancialStatusKey;
  visitDate: DateOnly;
  visitDateLong: string;
  day: { opensAt: string | null; closesAt: string | null; label: string | null };
  buyerName: string;
  buyerEmailMasked: string | null;
  items: {
    name: string;
    priceLabel: string | null;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
    totalCents: number;
  }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  couponCode: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  payment: {
    id: string;
    status: PaymentStatusKey;
    pixPayload: string | null;
    qrSvg: string | null;
    expiresAt: Date | null;
  } | null;
  tickets: PublicOrderTicket[];
  canSimulatePayment: boolean;
  /** Pago fora do prazo sem vaga, ou pago depois de cancelado: o parque precisa devolver. */
  needsRefund: boolean;
}

function mascararEmail(email: string | null): string | null {
  if (!email) return null;
  const [usuario = '', dominio = ''] = email.split('@');
  const visivel = usuario.slice(0, usuario.length > 3 ? 2 : 1);
  return `${visivel}${'*'.repeat(Math.max(3, usuario.length - visivel.length))}@${dominio}`;
}

function qrSvg(conteudo: string): Promise<string> {
  return QRCode.toString(conteudo, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#1E1A2EFF', light: '#FFFFFFFF' },
  });
}

export async function getPublicOrder(
  parkId: string,
  codigoInformado: string,
  token: string | null | undefined,
  db: DbClient = prisma,
): Promise<PublicOrderView | null> {
  const code = normalizeOrderCode(codigoInformado);
  if (!code || !token) return null;

  const pedido = await db.order.findUnique({
    where: { parkId_code: { parkId, code } },
    include: {
      parkDay: { select: { opensAt: true, closesAt: true, label: true } },
      coupon: { select: { code: true } },
      items: { include: { ticketType: { select: { sortOrder: true } } } },
      tickets: { include: { ticketType: { select: { name: true, sortOrder: true } } } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!pedido || !isOrderAccessTokenValid(pedido, token)) return null;

  const agora = new Date();
  const status = effectiveOrderStatus(pedido, agora);
  const pagamento = pedido.payments[0] ?? null;
  const pixNoPrazo =
    status === 'PENDING_PAYMENT' && pagamento?.status === 'AWAITING' && pagamento.pixPayload
      ? pagamento.pixPayload
      : null;

  const ingressos = [...pedido.tickets].sort(
    (a, b) =>
      a.ticketType.sortOrder - b.ticketType.sortOrder ||
      (a.holderName ?? '').localeCompare(b.holderName ?? '') ||
      a.code.localeCompare(b.code),
  );

  return {
    id: pedido.id,
    code: pedido.code,
    status,
    financialStatus: pedido.financialStatus,
    visitDate: dbToDateOnly(pedido.visitDate),
    visitDateLong: formatDateLong(dbToDateOnly(pedido.visitDate)),
    day: pedido.parkDay,
    buyerName: pedido.buyerName,
    buyerEmailMasked: mascararEmail(pedido.buyerEmail),
    items: [...pedido.items]
      .sort((a, b) => a.ticketType.sortOrder - b.ticketType.sortOrder)
      .map((item) => ({
        name: item.ticketTypeName,
        priceLabel: item.priceLabel,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        totalCents: item.totalCents,
      })),
    subtotalCents: pedido.subtotalCents,
    discountCents: pedido.discountCents,
    totalCents: pedido.totalCents,
    couponCode: pedido.coupon?.code ?? null,
    createdAt: pedido.createdAt,
    expiresAt: pedido.expiresAt,
    confirmedAt: pedido.confirmedAt,
    cancelledAt: pedido.cancelledAt,
    payment: pagamento
      ? {
          id: pagamento.id,
          status: pagamento.status,
          pixPayload: pixNoPrazo,
          qrSvg: pixNoPrazo ? await qrSvg(pixNoPrazo) : null,
          expiresAt: pagamento.expiresAt,
        }
      : null,
    tickets: await Promise.all(
      ingressos.map(async (ingresso) => ({
        code: ingresso.code,
        typeName: ingresso.ticketType.name,
        holderName: ingresso.holderName,
        status: ingresso.status,
        checkedInAt: ingresso.checkedInAt,
        qrSvg:
          status === 'CONFIRMED' && ingresso.status === 'ACTIVE'
            ? await qrSvg(ticketQrPayload({ parkId, code: ingresso.code, qrVersion: ingresso.qrVersion }))
            : null,
      })),
    ),
    canSimulatePayment: paymentSimulationEnabled() && Boolean(pixNoPrazo) && pagamento?.provider === 'MOCK',
    needsRefund: pedido.financialStatus === 'PAID' && pedido.status !== 'CONFIRMED',
  };
}

/**
 * "Meus ingressos": manda por e-mail os links dos pedidos daquele endereço.
 * A resposta é sempre a mesma, exista pedido ou não — ninguém descobre por
 * aqui se um e-mail comprou no parque.
 */
export async function requestOrderLinks(
  input: { park: PublicPark; email: string; meta: RequestMeta },
  db: DbClient = prisma,
): Promise<void> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) throw fromZodError(parsed.error);
  const email = parsed.data;

  await enforceRateLimit({ key: rateLimitKey('links-ip', input.meta.ip), limit: 10, windowSeconds: 900 }, db);
  const porEmail = await consumeRateLimit(
    { key: rateLimitKey('links-email', input.park.id, email), limit: 3, windowSeconds: 3600 },
    db,
  );
  if (!porEmail.allowed) return;

  const agora = new Date();
  const pedidos = await db.order.findMany({
    where: {
      parkId: input.park.id,
      buyerEmail: email,
      createdAt: { gte: new Date(agora.getTime() - 180 * 86_400_000) },
      OR: [{ status: 'CONFIRMED' }, { status: 'PENDING_PAYMENT', expiresAt: { gt: agora } }],
    },
    orderBy: { visitDate: 'desc' },
    take: 10,
    select: { id: true, code: true, accessVersion: true, status: true, expiresAt: true, visitDate: true },
  });
  if (pedidos.length === 0) return;

  const mensagem = orderLinksEmail({
    parkName: input.park.name,
    orders: pedidos.map((pedido) => ({
      code: pedido.code,
      visitDate: formatDateLong(dbToDateOnly(pedido.visitDate)),
      status: ORDER_STATUS_LABELS[effectiveOrderStatus(pedido, agora)],
      url: orderPublicUrl(pedido),
    })),
  });
  await emailProvider().send({
    to: email,
    subject: mensagem.subject,
    html: mensagem.html,
    text: mensagem.text,
    tag: 'order_links',
  });
}
