import 'server-only';

import type { AuditActorType, Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  addDays,
  dateOnlyToDb,
  dbToDateOnly,
  formatDateBR,
  formatDateTimeBR,
  todayIn,
  zonedTimeToInstant,
  type DateOnly,
} from '@/lib/dates';
import { formatPhoneBR, isValidCpf, onlyDigits } from '@/lib/documents';
import {
  effectiveOrderStatus,
  normalizeOrderCode,
  ORDER_CHANNEL_LABELS,
  ORDER_STATUS_LABELS,
  orderReasonSchema,
  PAYMENT_GROUP_METHODS,
  PAYMENT_METHOD_LABELS,
  SALE_STATUS_LABELS,
  saleStatusOf,
  type FinancialStatusKey,
  type OrderChannelKey,
  type OrderReasonInput,
  type OrderStatusKey,
  type PaymentGroupKey,
  type PaymentMethodKey,
  type PaymentStatusKey,
  type SaleStatusKey,
  type TicketStatusKey,
} from '@/lib/orders';

import { recordAudit } from '../audit';
import { can, requirePermission, type AuthContext } from '../auth/context';
import { centsToCsv, toCsv } from '../csv';
import { prisma, type DbClient } from '../db';
import { AppError, Errors, fromZodError } from '../errors';
import { logger } from '../logger';
import { gatewayFor } from '../payments';
import { paymentSimulationEnabled, simulateMockPayment } from '../payments/service';
import { enforceRateLimit, rateLimitKey } from '../rate-limit';
import type { RequestMeta } from '../request';
import { hashCpf } from '../signing';
import {
  orderPublicUrl,
  sendOrderCancelledEmail,
  sendOrderConfirmedEmail,
  sendOrderReceivedEmail,
} from './emails';
import { orderWhatsappUrl } from './whatsapp';

/**
 * Vendas no painel: busca, ficha completa com linha do tempo e as ações de
 * atendimento (cancelar, reembolsar, reenviar por e-mail ou WhatsApp, gerar
 * novo link, consultar pagamento). Toda ação exige motivo quando mexe em
 * dinheiro ou ingresso, e fica na auditoria.
 */

export const ORDERS_PAGE_SIZE = 25;
const LIMITE_EXPORTACAO = 50_000;

export interface OrderListFilters {
  q?: string;
  status?: SaleStatusKey;
  channel?: OrderChannelKey;
  payment?: PaymentGroupKey;
  financial?: FinancialStatusKey;
  visitFrom?: DateOnly;
  visitTo?: DateOnly;
  createdFrom?: DateOnly;
  createdTo?: DateOnly;
  page?: number;
}

function filtrosDoPedido(auth: AuthContext, filtros: OrderListFilters, agora: Date): Prisma.OrderWhereInput {
  const e: Prisma.OrderWhereInput[] = [{ parkId: auth.park.id }];
  const fuso = auth.park.timezone;

  const reembolsos: FinancialStatusKey[] = ['REFUNDED', 'PARTIALLY_REFUNDED'];
  if (filtros.status === 'PAID') e.push({ status: 'CONFIRMED', financialStatus: { notIn: reembolsos } });
  else if (filtros.status === 'PENDING') e.push({ status: 'PENDING_PAYMENT', expiresAt: { gt: agora } });
  else if (filtros.status === 'CANCELLED') {
    e.push(
      { financialStatus: { notIn: reembolsos } },
      {
        OR: [
          { status: { in: ['CANCELLED', 'EXPIRED'] } },
          { status: 'PENDING_PAYMENT', expiresAt: { lte: agora } },
        ],
      },
    );
  } else if (filtros.status === 'REFUNDED') e.push({ financialStatus: { in: reembolsos } });
  if (filtros.channel) e.push({ channel: filtros.channel });
  if (filtros.payment) {
    e.push({
      payments: {
        some: {
          method: { in: [...PAYMENT_GROUP_METHODS[filtros.payment]] },
          status: { in: ['AWAITING', 'PROCESSING', 'APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
        },
      },
    });
  }
  if (filtros.financial) e.push({ financialStatus: filtros.financial });
  if (filtros.visitFrom) e.push({ visitDate: { gte: dateOnlyToDb(filtros.visitFrom) } });
  if (filtros.visitTo) e.push({ visitDate: { lte: dateOnlyToDb(filtros.visitTo) } });
  if (filtros.createdFrom)
    e.push({ createdAt: { gte: zonedTimeToInstant(filtros.createdFrom, '00:00', fuso) } });
  if (filtros.createdTo) {
    e.push({ createdAt: { lt: zonedTimeToInstant(addDays(filtros.createdTo, 1), '00:00', fuso) } });
  }

  const q = filtros.q?.trim();
  if (q) {
    const ou: Prisma.OrderWhereInput[] = [];
    const codigo = normalizeOrderCode(q);
    ou.push(codigo ? { code: codigo } : { code: { contains: q.toUpperCase() } });
    const digitos = onlyDigits(q);
    if (/^[\d\s().+-]+$/.test(q)) {
      if (digitos.length === 11 && isValidCpf(digitos)) {
        const cpfHash = hashCpf(digitos);
        ou.push({ customer: { cpfHash } }, { tickets: { some: { holderCpfHash: cpfHash } } });
      }
      if (digitos.length >= 8) ou.push({ buyerPhone: { contains: digitos } });
    } else {
      ou.push(
        { buyerName: { contains: q, mode: 'insensitive' } },
        { buyerEmail: { contains: q.toLowerCase() } },
      );
      const codigoDeIngresso = q.toUpperCase().replace(/[\s-]/g, '');
      if (/^[0-9A-HJKMNP-TV-Z]{10}$/.test(codigoDeIngresso)) {
        ou.push({ tickets: { some: { code: codigoDeIngresso } } });
      }
    }
    e.push({ OR: ou });
  }
  return { AND: e };
}

export interface AdminOrderListItem {
  id: string;
  code: string;
  buyerName: string;
  buyerEmail: string | null;
  status: OrderStatusKey;
  saleStatus: SaleStatusKey;
  financialStatus: FinancialStatusKey;
  channel: OrderChannelKey;
  paymentMethod: PaymentMethodKey | null;
  visitDate: DateOnly;
  ticketsCount: number;
  totalCents: number;
  discountCents: number;
  couponCode: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
}

const SELECAO_DA_LISTA = {
  id: true,
  code: true,
  buyerName: true,
  buyerEmail: true,
  buyerPhone: true,
  status: true,
  expiresAt: true,
  financialStatus: true,
  channel: true,
  visitDate: true,
  subtotalCents: true,
  totalCents: true,
  discountCents: true,
  createdAt: true,
  confirmedAt: true,
  utmSource: true,
  coupon: { select: { code: true } },
  payments: { select: { method: true, status: true }, orderBy: { createdAt: 'desc' } },
  _count: { select: { tickets: true } },
} satisfies Prisma.OrderSelect;

type PedidoDaLista = Prisma.OrderGetPayload<{ select: typeof SELECAO_DA_LISTA }>;

const PAGAMENTO_EFETIVADO: readonly PaymentStatusKey[] = [
  'APPROVED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'CHARGEBACK',
];

/** Forma de pagamento da venda: a do pagamento que entrou; sem ele, a da última cobrança. */
function formaDePagamento(
  pagamentos: readonly { method: PaymentMethodKey; status: PaymentStatusKey }[],
): PaymentMethodKey | null {
  return (pagamentos.find((p) => PAGAMENTO_EFETIVADO.includes(p.status)) ?? pagamentos[0])?.method ?? null;
}

function paraItemDaLista(pedido: PedidoDaLista, agora: Date): AdminOrderListItem {
  return {
    id: pedido.id,
    code: pedido.code,
    buyerName: pedido.buyerName,
    buyerEmail: pedido.buyerEmail,
    status: effectiveOrderStatus(pedido, agora),
    saleStatus: saleStatusOf(pedido, agora),
    financialStatus: pedido.financialStatus,
    channel: pedido.channel,
    paymentMethod: formaDePagamento(pedido.payments),
    visitDate: dbToDateOnly(pedido.visitDate),
    ticketsCount: pedido._count.tickets,
    totalCents: pedido.totalCents,
    discountCents: pedido.discountCents,
    couponCode: pedido.coupon?.code ?? null,
    createdAt: pedido.createdAt,
    confirmedAt: pedido.confirmedAt,
  };
}

export async function listOrders(
  auth: AuthContext,
  filtros: OrderListFilters = {},
  db: DbClient = prisma,
): Promise<{
  items: AdminOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: { confirmedOrders: number; confirmedTotalCents: number };
}> {
  requirePermission(auth, 'orders.view');
  const agora = new Date();
  const where = filtrosDoPedido(auth, filtros, agora);
  const pagina = Math.max(1, Math.floor(filtros.page ?? 1));

  const [pedidos, total, confirmados] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (pagina - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      select: SELECAO_DA_LISTA,
    }),
    db.order.count({ where }),
    db.order.aggregate({
      where: { AND: [where, { status: 'CONFIRMED' }] },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
  ]);

  return {
    items: pedidos.map((pedido) => paraItemDaLista(pedido, agora)),
    total,
    page: pagina,
    pageSize: ORDERS_PAGE_SIZE,
    summary: {
      confirmedOrders: confirmados._count._all,
      confirmedTotalCents: confirmados._sum.totalCents ?? 0,
    },
  };
}

// ─── Ficha ──────────────────────────────────────────────────────────────────

export interface AdminOrderDetail {
  id: string;
  code: string;
  status: OrderStatusKey;
  saleStatus: SaleStatusKey;
  /** Pagamento recebido pela equipe (dinheiro ou maquininha): o reembolso é devolvido no balcão. */
  manualPayment: boolean;
  financialStatus: FinancialStatusKey;
  channel: OrderChannelKey;
  visitDate: DateOnly;
  day: { opensAt: string | null; closesAt: string | null; label: string | null };
  buyer: { name: string; email: string | null; phone: string | null; cpfMasked: string | null };
  customer: { id: string; name: string } | null;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalCents: number;
  coupon: { id: string; code: string } | null;
  createdAt: Date;
  expiresAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  soldByName: string | null;
  attribution: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    referrer: string | null;
  };
  createdIp: string | null;
  userAgent: string | null;
  items: {
    id: string;
    name: string;
    priceLabel: string | null;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
    totalCents: number;
  }[];
  tickets: {
    id: string;
    code: string;
    typeName: string;
    holderName: string | null;
    holderCpfMasked: string | null;
    holderBirthDate: DateOnly | null;
    status: TicketStatusKey;
    priceCents: number;
    checkedInAt: Date | null;
    checkedInByName: string | null;
  }[];
  payments: {
    id: string;
    provider: 'MOCK' | 'ASAAS' | 'MANUAL';
    method: PaymentMethodKey;
    status: PaymentStatusKey;
    amountCents: number;
    refundedCents: number;
    feeCents: number | null;
    providerPaymentId: string | null;
    createdAt: Date;
    approvedAt: Date | null;
    expiresAt: Date | null;
    failureMessage: string | null;
    transactions: {
      id: string;
      kind: 'CREATED' | 'STATUS_CHANGED' | 'WEBHOOK' | 'RECONCILED' | 'ERROR';
      fromStatus: PaymentStatusKey | null;
      toStatus: PaymentStatusKey | null;
      createdAt: Date;
    }[];
  }[];
  timeline: {
    id: string;
    at: Date;
    action: string;
    actorType: AuditActorType;
    actorName: string | null;
    data: Prisma.JsonValue | null;
  }[];
  actions: {
    canCancel: boolean;
    canRefund: boolean;
    canResend: boolean;
    canShareWhatsapp: boolean;
    canRegenerateLink: boolean;
    canReconcile: boolean;
    canSimulatePayment: boolean;
  };
  /** Link do cliente; só para quem pode reenviar ingressos. */
  publicUrl: string | null;
  needsRefund: boolean;
}

export async function getOrderAdmin(
  auth: AuthContext,
  id: string,
  db: DbClient = prisma,
): Promise<AdminOrderDetail> {
  requirePermission(auth, 'orders.view');
  const pedido = await db.order.findFirst({
    where: { id, parkId: auth.park.id },
    include: {
      parkDay: { select: { opensAt: true, closesAt: true, label: true } },
      customer: { select: { id: true, name: true } },
      coupon: { select: { id: true, code: true } },
      cancelledBy: { select: { name: true } },
      soldBy: { select: { name: true } },
      items: { include: { ticketType: { select: { sortOrder: true } } } },
      tickets: {
        include: {
          ticketType: { select: { name: true, sortOrder: true } },
          checkedInBy: { select: { name: true } },
        },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        include: { transactions: { orderBy: { createdAt: 'asc' } } },
      },
    },
  });
  if (!pedido) throw Errors.notFound('Pedido não encontrado.');

  const idsDosPagamentos = pedido.payments.map((pagamento) => pagamento.id);
  const registros = await db.auditLog.findMany({
    where: {
      parkId: auth.park.id,
      OR: [
        { entityType: 'order', entityId: id },
        ...(idsDosPagamentos.length > 0
          ? [{ entityType: 'payment', entityId: { in: idsDosPagamentos } }]
          : []),
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 200,
    include: { actorUser: { select: { name: true } } },
  });

  const agora = new Date();
  const status = effectiveOrderStatus(pedido, agora);
  const pendente = status === 'PENDING_PAYMENT';
  const usados = pedido.tickets.some((ingresso) => ingresso.status === 'CHECKED_IN');
  const aprovados = pedido.payments.filter(
    (pagamento) =>
      pagamento.status === 'APPROVED' && (pagamento.providerPaymentId || pagamento.provider === 'MANUAL'),
  );
  const podeReenviar = can(auth, 'orders.resend') && (pendente || pedido.status === 'CONFIRMED');

  return {
    id: pedido.id,
    code: pedido.code,
    status,
    saleStatus: saleStatusOf(pedido, agora),
    manualPayment: aprovados.some((pagamento) => pagamento.provider === 'MANUAL'),
    financialStatus: pedido.financialStatus,
    channel: pedido.channel,
    visitDate: dbToDateOnly(pedido.visitDate),
    day: pedido.parkDay,
    buyer: {
      name: pedido.buyerName,
      email: pedido.buyerEmail,
      phone: pedido.buyerPhone,
      cpfMasked: pedido.buyerCpfMasked,
    },
    customer: pedido.customer,
    subtotalCents: pedido.subtotalCents,
    discountCents: pedido.discountCents,
    feeCents: pedido.feeCents,
    totalCents: pedido.totalCents,
    coupon: pedido.coupon,
    createdAt: pedido.createdAt,
    expiresAt: pedido.expiresAt,
    confirmedAt: pedido.confirmedAt,
    cancelledAt: pedido.cancelledAt,
    cancelReason: pedido.cancelReason,
    cancelledByName: pedido.cancelledBy?.name ?? null,
    soldByName: pedido.soldBy?.name ?? null,
    attribution: {
      utmSource: pedido.utmSource,
      utmMedium: pedido.utmMedium,
      utmCampaign: pedido.utmCampaign,
      utmContent: pedido.utmContent,
      utmTerm: pedido.utmTerm,
      referrer: pedido.referrer,
    },
    createdIp: pedido.createdIp,
    userAgent: pedido.userAgent,
    items: [...pedido.items]
      .sort((a, b) => a.ticketType.sortOrder - b.ticketType.sortOrder)
      .map((item) => ({
        id: item.id,
        name: item.ticketTypeName,
        priceLabel: item.priceLabel,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        totalCents: item.totalCents,
      })),
    tickets: [...pedido.tickets]
      .sort(
        (a, b) =>
          a.ticketType.sortOrder - b.ticketType.sortOrder ||
          (a.holderName ?? '').localeCompare(b.holderName ?? '') ||
          a.code.localeCompare(b.code),
      )
      .map((ingresso) => ({
        id: ingresso.id,
        code: ingresso.code,
        typeName: ingresso.ticketType.name,
        holderName: ingresso.holderName,
        holderCpfMasked: ingresso.holderCpfMasked,
        holderBirthDate: ingresso.holderBirthDate ? dbToDateOnly(ingresso.holderBirthDate) : null,
        status: ingresso.status,
        priceCents: ingresso.priceCents,
        checkedInAt: ingresso.checkedInAt,
        checkedInByName: ingresso.checkedInBy?.name ?? null,
      })),
    payments: pedido.payments.map((pagamento) => ({
      id: pagamento.id,
      provider: pagamento.provider,
      method: pagamento.method,
      status: pagamento.status,
      amountCents: pagamento.amountCents,
      refundedCents: pagamento.refundedCents,
      feeCents: pagamento.feeCents,
      providerPaymentId: pagamento.providerPaymentId,
      createdAt: pagamento.createdAt,
      approvedAt: pagamento.approvedAt,
      expiresAt: pagamento.expiresAt,
      failureMessage: pagamento.failureMessage,
      transactions: pagamento.transactions.map((transacao) => ({
        id: transacao.id,
        kind: transacao.kind,
        fromStatus: transacao.fromStatus,
        toStatus: transacao.toStatus,
        createdAt: transacao.createdAt,
      })),
    })),
    timeline: registros.map((registro) => ({
      id: registro.id,
      at: registro.createdAt,
      action: registro.action,
      actorType: registro.actorType,
      actorName: registro.actorUser?.name ?? null,
      data: registro.data,
    })),
    actions: {
      canCancel:
        can(auth, 'orders.cancel') &&
        !usados &&
        (pendente || (pedido.status === 'CONFIRMED' && pedido.financialStatus === 'NOT_APPLICABLE')),
      canRefund:
        can(auth, 'refunds.approve') && !usados && pedido.financialStatus === 'PAID' && aprovados.length > 0,
      canResend: podeReenviar && pedido.buyerEmail !== null,
      canShareWhatsapp: podeReenviar && pedido.buyerPhone !== null,
      canRegenerateLink: can(auth, 'tickets.manage'),
      canReconcile:
        can(auth, 'finance.view') &&
        pedido.payments.some(
          (pagamento) =>
            pagamento.providerPaymentId &&
            (pagamento.status === 'AWAITING' || pagamento.status === 'PROCESSING'),
        ),
      canSimulatePayment:
        paymentSimulationEnabled() &&
        can(auth, 'finance.view') &&
        pendente &&
        pedido.payments.some((pagamento) => pagamento.provider === 'MOCK' && pagamento.status === 'AWAITING'),
    },
    publicUrl: can(auth, 'orders.resend') ? orderPublicUrl(pedido) : null,
    needsRefund: pedido.financialStatus === 'PAID' && pedido.status !== 'CONFIRMED',
  };
}

// ─── Ações ──────────────────────────────────────────────────────────────────

function lerMotivo(input: OrderReasonInput): string {
  const parsed = orderReasonSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  return parsed.data.reason;
}

/** Cancela pedido aguardando pagamento, ou confirmado sem valor cobrado (sem entradas registradas). */
export async function cancelOrder(
  auth: AuthContext,
  orderId: string,
  input: OrderReasonInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminOrderDetail> {
  requirePermission(auth, 'orders.cancel');
  const motivo = lerMotivo(input);
  const agora = new Date();

  const cobrancas = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid AND park_id = ${auth.park.id}::uuid FOR UPDATE`;
    const pedido = await tx.order.findFirst({
      where: { id: orderId, parkId: auth.park.id },
      include: { tickets: { select: { id: true, status: true } } },
    });
    if (!pedido) throw Errors.notFound('Pedido não encontrado.');

    const status = effectiveOrderStatus(pedido, agora);
    const semCobranca = pedido.status === 'CONFIRMED' && pedido.financialStatus === 'NOT_APPLICABLE';
    if (status !== 'PENDING_PAYMENT' && !semCobranca) {
      if (pedido.financialStatus === 'PAID') {
        throw new AppError('CONFLICT', 'Este pedido foi pago. Para cancelar, faça o reembolso.');
      }
      throw new AppError(
        'CONFLICT',
        `Um pedido ${ORDER_STATUS_LABELS[status].toLowerCase()} não pode ser cancelado.`,
      );
    }
    if (pedido.tickets.some((ingresso) => ingresso.status === 'CHECKED_IN')) {
      throw new AppError(
        'CONFLICT',
        'Há ingressos deste pedido já utilizados na portaria. O pedido não pode ser cancelado.',
      );
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelledAt: agora, cancelledById: auth.user.id, cancelReason: motivo },
    });
    const afetados = pedido.tickets.filter(
      (ingresso) => ingresso.status === 'ACTIVE' || ingresso.status === 'PENDING_PAYMENT',
    );
    await tx.ticket.updateMany({
      where: { id: { in: afetados.map((ingresso) => ingresso.id) } },
      data: { status: 'CANCELLED', cancelledAt: agora },
    });
    await tx.ticketEvent.createMany({
      data: afetados.map((ingresso) => ({
        ticketId: ingresso.id,
        type: 'CANCELLED' as const,
        actorUserId: auth.user.id,
        data: { reason: motivo },
      })),
    });
    await tx.capacityHold.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status: 'RELEASED' } });
    await tx.couponUsage.updateMany({
      where: { orderId, status: { in: ['RESERVED', 'CONFIRMED'] } },
      data: { status: 'RELEASED' },
    });
    const aguardando = await tx.payment.findMany({
      where: { orderId, status: 'AWAITING' },
      select: { id: true, provider: true, providerPaymentId: true },
    });
    for (const pagamento of aguardando) {
      await tx.payment.update({ where: { id: pagamento.id }, data: { status: 'CANCELLED' } });
      await tx.paymentTransaction.create({
        data: {
          paymentId: pagamento.id,
          kind: 'STATUS_CHANGED',
          fromStatus: 'AWAITING',
          toStatus: 'CANCELLED',
        },
      });
    }
    await recordAudit(tx, {
      action: 'orders.cancelled',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'order',
      entityId: orderId,
      before: { status },
      data: { code: pedido.code, reason: motivo, tickets: afetados.length },
      meta,
    });
    return aguardando;
  });

  for (const cobranca of cobrancas) {
    if (!cobranca.providerPaymentId) continue;
    await gatewayFor(cobranca.provider)
      .cancelCharge(cobranca.providerPaymentId)
      .catch((erro: unknown) =>
        logger.warn({ err: erro, paymentId: cobranca.id }, 'falha ao cancelar cobrança'),
      );
  }
  await sendOrderCancelledEmail(orderId, null, db).catch((erro: unknown) =>
    logger.error({ err: erro, orderId }, 'falha ao enviar e-mail de cancelamento'),
  );
  return getOrderAdmin(auth, orderId, db);
}

/**
 * Reembolso total de pedido pago, sem entradas registradas. A chamada ao
 * provedor acontece com o pagamento travado: dois cliques não devolvem duas vezes.
 */
export async function refundOrder(
  auth: AuthContext,
  orderId: string,
  input: OrderReasonInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminOrderDetail> {
  requirePermission(auth, 'refunds.approve');
  const motivo = lerMotivo(input);
  const agora = new Date();

  const valor = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid AND park_id = ${auth.park.id}::uuid FOR UPDATE`;
      const pedido = await tx.order.findFirst({
        where: { id: orderId, parkId: auth.park.id },
        include: { tickets: { select: { id: true, status: true } } },
      });
      if (!pedido) throw Errors.notFound('Pedido não encontrado.');
      if (pedido.financialStatus !== 'PAID') {
        throw new AppError('CONFLICT', 'Só pedidos pagos podem ser reembolsados.');
      }
      if (pedido.tickets.some((ingresso) => ingresso.status === 'CHECKED_IN')) {
        throw new AppError(
          'CONFLICT',
          'Há ingressos deste pedido já utilizados na portaria. O reembolso parcial ainda não está disponível.',
        );
      }

      const aprovados = await tx.payment.findMany({
        where: {
          orderId,
          status: 'APPROVED',
          OR: [{ providerPaymentId: { not: null } }, { provider: 'MANUAL' }],
        },
      });
      const pagamento = aprovados[0];
      if (!pagamento) {
        throw new AppError('CONFLICT', 'Não há pagamento aprovado para reembolsar neste pedido.');
      }
      if (aprovados.length > 1) {
        throw new AppError(
          'CONFLICT',
          'Este pedido tem mais de um pagamento aprovado. Faça a conciliação com o financeiro.',
        );
      }
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${pagamento.id}::uuid FOR UPDATE`;

      // Recebido no balcão: a equipe devolve o dinheiro na hora, sem provedor.
      let devolvido = pagamento.amountCents;
      if (pagamento.provider !== 'MANUAL') {
        if (!pagamento.providerPaymentId) {
          throw new AppError('CONFLICT', 'Não há pagamento aprovado para reembolsar neste pedido.');
        }
        const situacao = await gatewayFor(pagamento.provider).refundCharge(
          pagamento.providerPaymentId,
          pagamento.amountCents,
        );
        devolvido = situacao.refundedCents || pagamento.amountCents;
      }

      await tx.payment.update({
        where: { id: pagamento.id },
        data: { status: 'REFUNDED', refundedCents: devolvido },
      });
      await tx.paymentTransaction.create({
        data: {
          paymentId: pagamento.id,
          kind: 'STATUS_CHANGED',
          fromStatus: 'APPROVED',
          toStatus: 'REFUNDED',
          amountCents: devolvido,
          providerReference: pagamento.providerPaymentId,
          data: { reason: motivo, userId: auth.user.id, manual: pagamento.provider === 'MANUAL' },
        },
      });

      const estavaConfirmado = pedido.status === 'CONFIRMED';
      await tx.order.update({
        where: { id: orderId },
        data: {
          financialStatus: 'REFUNDED',
          ...(estavaConfirmado ? { status: 'CANCELLED' as const } : {}),
          cancelledAt: pedido.cancelledAt ?? agora,
          cancelledById: pedido.cancelledById ?? auth.user.id,
          cancelReason: pedido.cancelReason ?? motivo,
        },
      });
      const afetados = pedido.tickets.filter((ingresso) =>
        ['ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'].includes(ingresso.status),
      );
      await tx.ticket.updateMany({
        where: { id: { in: afetados.map((ingresso) => ingresso.id) } },
        data: { status: 'REFUNDED', cancelledAt: agora },
      });
      await tx.ticketEvent.createMany({
        data: afetados.map((ingresso) => ({
          ticketId: ingresso.id,
          type: 'REFUNDED' as const,
          actorUserId: auth.user.id,
          data: { reason: motivo },
        })),
      });
      await tx.capacityHold.updateMany({
        where: { orderId, status: 'ACTIVE' },
        data: { status: 'RELEASED' },
      });
      await tx.couponUsage.updateMany({
        where: { orderId, status: { in: ['RESERVED', 'CONFIRMED'] } },
        data: { status: 'RELEASED' },
      });
      await recordAudit(tx, {
        action: 'orders.refunded',
        parkId: auth.park.id,
        actorUserId: auth.user.id,
        entityType: 'order',
        entityId: orderId,
        before: { status: pedido.status, financialStatus: pedido.financialStatus },
        data: { code: pedido.code, amountCents: devolvido, reason: motivo },
        meta,
      });
      return devolvido;
    },
    { maxWait: 10_000, timeout: 45_000 },
  );

  await sendOrderCancelledEmail(orderId, valor, db).catch((erro: unknown) =>
    logger.error({ err: erro, orderId }, 'falha ao enviar e-mail de reembolso'),
  );
  return getOrderAdmin(auth, orderId, db);
}

/** Reenvia ao comprador o e-mail do pedido (ingressos ou PIX pendente). */
export async function resendOrderEmail(
  auth: AuthContext,
  orderId: string,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<void> {
  requirePermission(auth, 'orders.resend');
  const pedido = await db.order.findFirst({
    where: { id: orderId, parkId: auth.park.id },
    select: { id: true, code: true, status: true, expiresAt: true, buyerEmail: true },
  });
  if (!pedido) throw Errors.notFound('Pedido não encontrado.');
  if (!pedido.buyerEmail) {
    throw new AppError(
      'CONFLICT',
      'Este pedido não tem e-mail cadastrado. Envie os ingressos pelo WhatsApp.',
    );
  }
  await enforceRateLimit({ key: rateLimitKey('reenvio-pedido', orderId), limit: 5, windowSeconds: 3600 }, db);

  const status = effectiveOrderStatus(pedido);
  let enviado = false;
  if (status === 'CONFIRMED') enviado = await sendOrderConfirmedEmail(orderId, db, { resend: true });
  else if (status === 'PENDING_PAYMENT')
    enviado = await sendOrderReceivedEmail(orderId, db, { resend: true });
  if (!enviado) {
    throw new AppError(
      'CONFLICT',
      `Um pedido ${ORDER_STATUS_LABELS[status].toLowerCase()} não tem e-mail para reenviar.`,
    );
  }

  if (status === 'CONFIRMED') {
    const ingressos = await db.ticket.findMany({
      where: { orderId, status: 'ACTIVE' },
      select: { id: true },
    });
    await db.ticketEvent.createMany({
      data: ingressos.map((ingresso) => ({
        ticketId: ingresso.id,
        type: 'RESENT' as const,
        actorUserId: auth.user.id,
        data: { channel: 'email' },
      })),
    });
  }
  await recordAudit(db, {
    action: 'orders.email_resent',
    parkId: auth.park.id,
    actorUserId: auth.user.id,
    entityType: 'order',
    entityId: orderId,
    data: { code: pedido.code, to: pedido.buyerEmail },
    meta,
  });
}

/**
 * Link do WhatsApp com a mensagem pronta e o link dos ingressos, para a equipe
 * enviar da própria conta do parque. Fica registrado no histórico do pedido.
 */
export async function shareOrderWhatsapp(
  auth: AuthContext,
  orderId: string,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<{ url: string }> {
  requirePermission(auth, 'orders.resend');
  const pedido = await db.order.findFirst({
    where: { id: orderId, parkId: auth.park.id },
    select: {
      id: true,
      code: true,
      status: true,
      expiresAt: true,
      accessVersion: true,
      buyerName: true,
      buyerPhone: true,
      visitDate: true,
    },
  });
  if (!pedido) throw Errors.notFound('Pedido não encontrado.');
  if (!pedido.buyerPhone) throw new AppError('CONFLICT', 'Este pedido não tem celular cadastrado.');
  const status = effectiveOrderStatus(pedido);
  if (status !== 'CONFIRMED' && status !== 'PENDING_PAYMENT') {
    throw new AppError(
      'CONFLICT',
      `Um pedido ${ORDER_STATUS_LABELS[status].toLowerCase()} não tem ingressos para enviar.`,
    );
  }

  const url = orderWhatsappUrl({
    phone: pedido.buyerPhone,
    parkName: auth.park.name,
    buyerName: pedido.buyerName,
    code: pedido.code,
    visitDate: dbToDateOnly(pedido.visitDate),
    publicUrl: orderPublicUrl(pedido),
    pending: status === 'PENDING_PAYMENT',
  });

  if (status === 'CONFIRMED') {
    const ingressos = await db.ticket.findMany({
      where: { orderId, status: 'ACTIVE' },
      select: { id: true },
    });
    await db.ticketEvent.createMany({
      data: ingressos.map((ingresso) => ({
        ticketId: ingresso.id,
        type: 'RESENT' as const,
        actorUserId: auth.user.id,
        data: { channel: 'whatsapp' },
      })),
    });
  }
  await recordAudit(db, {
    action: 'orders.whatsapp_shared',
    parkId: auth.park.id,
    actorUserId: auth.user.id,
    entityType: 'order',
    entityId: orderId,
    data: { code: pedido.code, to: pedido.buyerPhone },
    meta,
  });
  return { url };
}

/** Invalida o link antigo do pedido (ex.: foi compartilhado por engano) e devolve o novo. */
export async function regenerateOrderLink(
  auth: AuthContext,
  orderId: string,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<{ publicUrl: string }> {
  requirePermission(auth, 'tickets.manage');
  return db.$transaction(async (tx) => {
    const pedido = await tx.order.findFirst({
      where: { id: orderId, parkId: auth.park.id },
      select: { id: true },
    });
    if (!pedido) throw Errors.notFound('Pedido não encontrado.');
    const atualizado = await tx.order.update({
      where: { id: orderId },
      data: { accessVersion: { increment: 1 } },
      select: { id: true, code: true, accessVersion: true },
    });
    await recordAudit(tx, {
      action: 'orders.link_regenerated',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'order',
      entityId: orderId,
      data: { code: atualizado.code, accessVersion: atualizado.accessVersion },
      meta,
    });
    return { publicUrl: orderPublicUrl(atualizado) };
  });
}

/** Ambiente de teste: aprova ou recusa o PIX do pedido pelo painel. */
export async function simulateOrderPayment(
  auth: AuthContext,
  orderId: string,
  outcome: 'APPROVED' | 'DECLINED',
  db: PrismaClient = prisma,
): Promise<AdminOrderDetail> {
  requirePermission(auth, 'finance.view');
  if (!paymentSimulationEnabled()) throw Errors.notFound();
  const pedido = await db.order.findFirst({
    where: { id: orderId, parkId: auth.park.id },
    select: { id: true },
  });
  if (!pedido) throw Errors.notFound('Pedido não encontrado.');
  await simulateMockPayment({ orderId, outcome }, db);
  return getOrderAdmin(auth, orderId, db);
}

/** Planilha de vendas com os filtros da tela. Contém dado pessoal: fica na auditoria. */
export async function exportOrdersCsv(
  auth: AuthContext,
  filtros: Omit<OrderListFilters, 'page'>,
  meta: RequestMeta,
  db: DbClient = prisma,
): Promise<{ filename: string; content: string }> {
  requirePermission(auth, 'orders.view', 'reports.export');
  const agora = new Date();
  const pedidos = await db.order.findMany({
    where: filtrosDoPedido(auth, filtros, agora),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: LIMITE_EXPORTACAO,
    select: SELECAO_DA_LISTA,
  });
  const fuso = auth.park.timezone;
  const content = toCsv(
    [
      'Pedido',
      'Data da compra',
      'Data da visita',
      'Situação',
      'Canal',
      'Forma de pagamento',
      'Cliente',
      'E-mail',
      'Celular',
      'Ingressos',
      'Subtotal (R$)',
      'Desconto (R$)',
      'Total (R$)',
      'Cupom',
      'Origem',
    ],
    pedidos.map((pedido) => {
      const forma = formaDePagamento(pedido.payments);
      return [
        pedido.code,
        formatDateTimeBR(pedido.createdAt, fuso),
        formatDateBR(dbToDateOnly(pedido.visitDate)),
        SALE_STATUS_LABELS[saleStatusOf(pedido, agora)],
        ORDER_CHANNEL_LABELS[pedido.channel],
        forma ? PAYMENT_METHOD_LABELS[forma] : null,
        pedido.buyerName,
        pedido.buyerEmail,
        pedido.buyerPhone ? formatPhoneBR(pedido.buyerPhone) : null,
        pedido._count.tickets,
        centsToCsv(pedido.subtotalCents),
        centsToCsv(pedido.discountCents),
        centsToCsv(pedido.totalCents),
        pedido.coupon?.code ?? null,
        pedido.utmSource,
      ];
    }),
  );
  await recordAudit(db, {
    action: 'orders.exported',
    parkId: auth.park.id,
    actorUserId: auth.user.id,
    entityType: 'order',
    data: { rows: pedidos.length, filters: { ...filtros } },
    meta,
  });
  return { filename: `vendas-${todayIn(fuso)}.csv`, content };
}
