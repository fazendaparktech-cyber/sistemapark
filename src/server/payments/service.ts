import 'server-only';

import type {
  AuditActorType,
  Payment,
  PaymentProvider,
  Prisma,
  PrismaClient,
} from '@/generated/prisma/client';
import { effectiveOrderStatus } from '@/lib/orders';

import { recordAudit } from '../audit';
import { requirePermission, type AuthContext } from '../auth/context';
import { prisma, type DbClient, type Tx } from '../db';
import { env, isProduction } from '../env';
import { AppError, Errors } from '../errors';
import { logger } from '../logger';
import { sendOrderConfirmedEmail } from '../orders/emails';
import { isUniqueViolation } from '../prisma-errors';
import type { RequestMeta } from '../request';
import { lockParkDayById, occupiedPeople } from '../sales/availability';
import { gatewayFor, mockGateway, paymentGateway, type ChargeSnapshot, type PixCharge } from './index';

/**
 * Pagamentos: cobrança PIX, avisos do provedor (webhook), conciliação e a
 * confirmação do pedido. O status que vale é sempre o consultado no provedor.
 */

export interface PixPaymentView {
  id: string;
  provider: PaymentProvider;
  status: Payment['status'];
  amountCents: number;
  pixPayload: string | null;
  expiresAt: Date | null;
}

function paraPix(pagamento: Payment): PixPaymentView {
  return {
    id: pagamento.id,
    provider: pagamento.provider,
    status: pagamento.status,
    amountCents: pagamento.amountCents,
    pixPayload: pagamento.pixPayload,
    expiresAt: pagamento.expiresAt,
  };
}

/** Cobrança PIX do pedido: reaproveita a que está no prazo ou gera outra. */
export async function ensurePixPayment(
  orderId: string,
  options: { cpfDigits?: string | null } = {},
  db: PrismaClient = prisma,
): Promise<PixPaymentView | null> {
  const agora = new Date();
  const pedido = await db.order.findUnique({
    where: { id: orderId },
    include: { park: { select: { name: true } } },
  });
  if (
    !pedido ||
    !pedido.expiresAt ||
    pedido.totalCents <= 0 ||
    effectiveOrderStatus(pedido, agora) !== 'PENDING_PAYMENT'
  ) {
    return null;
  }

  const vigente = await db.payment.findFirst({
    where: {
      orderId,
      method: 'PIX',
      status: 'AWAITING',
      amountCents: pedido.totalCents,
      expiresAt: { gt: agora },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (vigente) return paraPix(vigente);

  const gateway = paymentGateway();
  const chave = `pix:${orderId}:${(await db.payment.count({ where: { orderId } })) + 1}`;
  let cobranca: PixCharge;
  try {
    cobranca = await gateway.createPixCharge({
      reference: orderId,
      description: `${pedido.park.name} - pedido ${pedido.code}`,
      amountCents: pedido.totalCents,
      expiresAt: pedido.expiresAt,
      payer: {
        name: pedido.buyerName,
        email: pedido.buyerEmail,
        phone: pedido.buyerPhone,
        cpfDigits: options.cpfDigits ?? null,
      },
      idempotencyKey: chave,
    });
  } catch (erro) {
    if (erro instanceof AppError) throw erro;
    logger.error({ err: erro, orderId }, 'falha ao criar cobrança PIX no provedor');
    throw new AppError(
      'PAYMENT_PROVIDER_ERROR',
      'Não foi possível gerar o PIX agora. Tente de novo em instantes.',
      {
        cause: erro,
      },
    );
  }

  try {
    const pagamento = await db.$transaction(async (tx) => {
      const criado = await tx.payment.create({
        data: {
          parkId: pedido.parkId,
          orderId,
          provider: gateway.provider,
          method: 'PIX',
          status: 'AWAITING',
          amountCents: pedido.totalCents,
          providerPaymentId: cobranca.providerPaymentId,
          pixPayload: cobranca.pixPayload,
          expiresAt: cobranca.expiresAt,
          idempotencyKey: chave,
        },
      });
      await tx.paymentTransaction.create({
        data: {
          paymentId: criado.id,
          kind: 'CREATED',
          toStatus: 'AWAITING',
          amountCents: criado.amountCents,
          providerReference: cobranca.providerPaymentId,
        },
      });
      return criado;
    });
    return paraPix(pagamento);
  } catch (erro) {
    if (!isUniqueViolation(erro)) throw erro;
    // Outra requisição gerou a cobrança ao mesmo tempo: fica a dela.
    await gateway.cancelCharge(cobranca.providerPaymentId).catch(() => undefined);
    const atual = await db.payment.findFirst({
      where: { orderId, status: 'AWAITING' },
      orderBy: { createdAt: 'desc' },
    });
    return atual ? paraPix(atual) : null;
  }
}

// ─── Confirmação do pedido ──────────────────────────────────────────────────

interface Ator {
  actorType: AuditActorType;
  actorUserId: string | null;
}

export interface OrderPaymentOutcome {
  confirmed: boolean;
  /** Dinheiro recebido para um pedido que não pôde ser confirmado: precisa de devolução. */
  lateConflict: boolean;
}

/** Libera os ingressos de um pedido pago. Idempotente: pedido já confirmado não muda. */
export async function confirmOrderPayment(
  tx: Tx,
  orderId: string,
  ator: Ator,
  agora: Date = new Date(),
): Promise<OrderPaymentOutcome> {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  const pedido = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { hold: true, couponUsage: true },
  });
  const auditoria = {
    parkId: pedido.parkId,
    actorType: ator.actorType,
    actorUserId: ator.actorUserId,
    entityType: 'order',
    entityId: orderId,
  };

  if (pedido.status === 'CONFIRMED') {
    if (pedido.financialStatus === 'UNPAID') {
      await tx.order.update({ where: { id: orderId }, data: { financialStatus: 'PAID' } });
    }
    return { confirmed: false, lateConflict: false };
  }

  if (pedido.status === 'CANCELLED') {
    await tx.order.update({ where: { id: orderId }, data: { financialStatus: 'PAID' } });
    await recordAudit(tx, { ...auditoria, action: 'orders.paid_after_cancel', data: { code: pedido.code } });
    return { confirmed: false, lateConflict: true };
  }

  const noPrazo =
    pedido.status === 'PENDING_PAYMENT' && pedido.expiresAt !== null && pedido.expiresAt > agora;
  if (!noPrazo) {
    // Pagou depois do prazo: as vagas já podem ter sido vendidas. Só confirma se ainda couber.
    const dia = await lockParkDayById(tx, pedido.parkDayId);
    const pessoas = await tx.ticket.count({ where: { orderId, occupiesCapacity: true } });
    const ocupadas = dia ? await occupiedPeople(tx, dia.id, pedido.hold?.id ?? null) : 0;
    if (!dia || dia.status !== 'OPEN' || ocupadas + pessoas > dia.capacity) {
      await tx.order.update({ where: { id: orderId }, data: { status: 'EXPIRED', financialStatus: 'PAID' } });
      await tx.ticket.updateMany({
        where: { orderId, status: 'PENDING_PAYMENT' },
        data: { status: 'EXPIRED' },
      });
      await recordAudit(tx, {
        ...auditoria,
        action: 'orders.late_payment_conflict',
        data: { code: pedido.code, people: pessoas, occupied: ocupadas, capacity: dia?.capacity ?? null },
      });
      return { confirmed: false, lateConflict: true };
    }
  }

  const ingressos = await tx.ticket.findMany({
    where: { orderId, status: { in: ['PENDING_PAYMENT', 'EXPIRED'] } },
    select: { id: true },
  });
  const ids = ingressos.map((ingresso) => ingresso.id);
  await tx.ticket.updateMany({ where: { id: { in: ids } }, data: { status: 'ACTIVE', activatedAt: agora } });
  await tx.ticketEvent.createMany({
    data: ids.map((ticketId) => ({ ticketId, type: 'ACTIVATED' as const, actorUserId: ator.actorUserId })),
  });
  await tx.order.update({
    where: { id: orderId },
    data: { status: 'CONFIRMED', financialStatus: 'PAID', confirmedAt: agora },
  });
  if (pedido.hold) {
    await tx.capacityHold.update({ where: { id: pedido.hold.id }, data: { status: 'CONVERTED' } });
  }
  if (pedido.couponUsage) {
    await tx.couponUsage.update({ where: { id: pedido.couponUsage.id }, data: { status: 'CONFIRMED' } });
  }
  await recordAudit(tx, {
    ...auditoria,
    action: noPrazo ? 'orders.confirmed' : 'orders.confirmed_late',
    data: { code: pedido.code, totalCents: pedido.totalCents, tickets: ids.length },
  });
  return { confirmed: true, lateConflict: false };
}

// ─── Situação da cobrança ───────────────────────────────────────────────────

export interface ChargeEffect {
  paymentId: string;
  orderId: string;
  changed: boolean;
  /** Pedido confirmado agora (para enviar o e-mail com os ingressos). */
  confirmedOrderId: string | null;
  lateConflict: boolean;
}

const STATUS_COM_APROVACAO = new Set(['APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED']);

/** Aplica a situação consultada no provedor ao pagamento e, se aprovado, ao pedido. */
export async function applyChargeSnapshot(
  paymentId: string,
  situacao: ChargeSnapshot,
  origem: { kind: 'WEBHOOK' | 'RECONCILED'; actorUserId?: string | null; webhookEventId?: string },
  db: PrismaClient = prisma,
): Promise<ChargeEffect> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const pagamento = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const agora = new Date();
      const efeito: ChargeEffect = {
        paymentId,
        orderId: pagamento.orderId,
        changed: false,
        confirmedOrderId: null,
        lateConflict: false,
      };

      if (situacao.status === 'APPROVED' && situacao.amountCents !== pagamento.amountCents) {
        await tx.paymentTransaction.create({
          data: {
            paymentId,
            kind: 'ERROR',
            fromStatus: pagamento.status,
            toStatus: pagamento.status,
            amountCents: situacao.amountCents,
            providerReference: situacao.providerPaymentId,
            data: {
              reason: 'amount_mismatch',
              expected: pagamento.amountCents,
              received: situacao.amountCents,
            },
          },
        });
        await recordAudit(tx, {
          action: 'payments.amount_mismatch',
          parkId: pagamento.parkId,
          actorType: 'SYSTEM',
          entityType: 'payment',
          entityId: paymentId,
          data: { expected: pagamento.amountCents, received: situacao.amountCents },
        });
        return efeito;
      }

      if (situacao.status !== pagamento.status) {
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: situacao.status,
            approvedAt: STATUS_COM_APROVACAO.has(situacao.status)
              ? (pagamento.approvedAt ?? situacao.paidAt ?? agora)
              : pagamento.approvedAt,
            feeCents: situacao.feeCents ?? pagamento.feeCents,
            netCents:
              situacao.feeCents !== null ? situacao.amountCents - situacao.feeCents : pagamento.netCents,
            refundedCents: Math.max(pagamento.refundedCents, situacao.refundedCents),
          },
        });
        const detalhes: Prisma.InputJsonValue | undefined = origem.webhookEventId
          ? { webhookEventId: origem.webhookEventId }
          : undefined;
        await tx.paymentTransaction.create({
          data: {
            paymentId,
            kind: origem.kind,
            fromStatus: pagamento.status,
            toStatus: situacao.status,
            amountCents: situacao.amountCents,
            providerReference: situacao.providerPaymentId,
            data: detalhes,
          },
        });
        efeito.changed = true;
      }

      if (situacao.status === 'APPROVED') {
        const resultado = await confirmOrderPayment(
          tx,
          pagamento.orderId,
          {
            actorType: origem.kind === 'WEBHOOK' ? 'WEBHOOK' : origem.actorUserId ? 'USER' : 'SYSTEM',
            actorUserId: origem.actorUserId ?? null,
          },
          agora,
        );
        efeito.confirmedOrderId = resultado.confirmed ? pagamento.orderId : null;
        efeito.lateConflict = resultado.lateConflict;
      }
      return efeito;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

async function depoisDaConfirmacao(efeito: ChargeEffect, db: DbClient): Promise<void> {
  if (!efeito.confirmedOrderId) return;
  const orderId = efeito.confirmedOrderId;
  await sendOrderConfirmedEmail(orderId, db).catch((erro: unknown) =>
    logger.error({ err: erro, orderId }, 'falha ao enviar e-mail de pedido confirmado'),
  );
}

// ─── Webhook ────────────────────────────────────────────────────────────────

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored' | 'invalid_signature' | 'malformed';

/**
 * Aviso do provedor. Assinatura inválida é recusada sem gravar nada; aviso
 * repetido não é processado de novo; falha fica registrada e o provedor tenta
 * outra vez.
 */
export async function processPaymentWebhook(
  provider: PaymentProvider,
  headers: Headers,
  rawBody: string,
  db: PrismaClient = prisma,
): Promise<WebhookOutcome> {
  const gateway = gatewayFor(provider);
  const aviso = gateway.parseWebhook(rawBody);
  if (!aviso) return 'malformed';
  if (!gateway.verifyWebhook(headers, rawBody)) {
    logger.warn({ provider, externalId: aviso.externalId }, 'webhook de pagamento com assinatura inválida');
    return 'invalid_signature';
  }

  const payload = JSON.parse(rawBody) as Prisma.InputJsonValue;
  let eventoId: string;
  try {
    const criado = await db.webhookEvent.create({
      data: {
        provider,
        externalId: aviso.externalId,
        eventType: aviso.eventType,
        verified: true,
        payload,
        attempts: 1,
      },
      select: { id: true },
    });
    eventoId = criado.id;
  } catch (erro) {
    if (!isUniqueViolation(erro)) throw erro;
    const anterior = await db.webhookEvent.findUnique({
      where: { provider_externalId: { provider, externalId: aviso.externalId } },
      select: { id: true, status: true },
    });
    if (!anterior || anterior.status === 'PROCESSED' || anterior.status === 'IGNORED') return 'duplicate';
    await db.webhookEvent.update({ where: { id: anterior.id }, data: { attempts: { increment: 1 } } });
    eventoId = anterior.id;
  }

  const ignorar = async (motivo: string): Promise<WebhookOutcome> => {
    await db.webhookEvent.update({
      where: { id: eventoId },
      data: { status: 'IGNORED', lastError: motivo, processedAt: new Date() },
    });
    return 'ignored';
  };

  try {
    if (!aviso.providerPaymentId) return await ignorar('Aviso sem cobrança associada.');
    const pagamento = await db.payment.findUnique({
      where: { provider_providerPaymentId: { provider, providerPaymentId: aviso.providerPaymentId } },
      select: { id: true },
    });
    if (!pagamento) return await ignorar('Cobrança desconhecida neste sistema.');

    const situacao = await gateway.getCharge(aviso.providerPaymentId);
    if (!situacao) throw new Error('A cobrança não foi encontrada no provedor.');

    const efeito = await applyChargeSnapshot(
      pagamento.id,
      situacao,
      { kind: 'WEBHOOK', webhookEventId: eventoId },
      db,
    );
    await db.webhookEvent.update({
      where: { id: eventoId },
      data: { status: 'PROCESSED', paymentId: pagamento.id, processedAt: new Date(), lastError: null },
    });
    await depoisDaConfirmacao(efeito, db);
    return 'processed';
  } catch (erro) {
    await db.webhookEvent.update({
      where: { id: eventoId },
      data: {
        status: 'FAILED',
        lastError: (erro instanceof Error ? erro.message : String(erro)).slice(0, 500),
      },
    });
    throw erro;
  }
}

// ─── Conciliação e ambiente de teste ────────────────────────────────────────

/** Consulta o provedor e atualiza o pagamento (botão "Consultar pagamento" no painel). */
export async function reconcilePayment(
  auth: AuthContext,
  paymentId: string,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<ChargeEffect> {
  requirePermission(auth, 'finance.view');
  const pagamento = await db.payment.findFirst({ where: { id: paymentId, parkId: auth.park.id } });
  if (!pagamento?.providerPaymentId) throw Errors.notFound('Pagamento não encontrado.');

  const situacao = await gatewayFor(pagamento.provider).getCharge(pagamento.providerPaymentId);
  if (!situacao) throw new AppError('PAYMENT_PROVIDER_ERROR', 'O provedor não encontrou esta cobrança.');
  const efeito = await applyChargeSnapshot(
    paymentId,
    situacao,
    { kind: 'RECONCILED', actorUserId: auth.user.id },
    db,
  );
  await recordAudit(db, {
    action: 'payments.reconciled',
    parkId: auth.park.id,
    actorUserId: auth.user.id,
    entityType: 'payment',
    entityId: paymentId,
    data: { status: situacao.status, changed: efeito.changed },
    meta,
  });
  await depoisDaConfirmacao(efeito, db);
  return efeito;
}

/** Botão de teste que simula o banco pagando ou recusando o PIX. Nunca existe em produção. */
export function paymentSimulationEnabled(): boolean {
  return !isProduction() && env().PAYMENT_PROVIDER === 'mock';
}

export async function simulateMockPayment(
  input: { orderId: string; outcome: 'APPROVED' | 'DECLINED' },
  db: PrismaClient = prisma,
): Promise<WebhookOutcome> {
  if (!paymentSimulationEnabled()) throw Errors.notFound();
  const pagamento = await db.payment.findFirst({
    where: { orderId: input.orderId, provider: 'MOCK', status: 'AWAITING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!pagamento?.providerPaymentId) {
    throw new AppError('ORDER_NOT_PAYABLE', 'Este pedido não tem PIX aguardando pagamento.');
  }
  const mock = mockGateway();
  await mock.setChargeStatus(pagamento.providerPaymentId, input.outcome);
  const { body, headers } = mock.buildWebhook(pagamento.providerPaymentId);
  return processPaymentWebhook('MOCK', headers, body, db);
}
