import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';

import { recordAudit } from '../audit';
import { prisma } from '../db';
import { logger } from '../logger';
import { sendOrderConfirmedEmail } from '../orders/emails';
import { gatewayFor } from '../payments';
import { applyChargeSnapshot } from '../payments/service';

/**
 * Rotina periódica (a cada poucos minutos): vence carrinhos e pedidos não
 * pagos e devolve as vagas. Antes de vencer um pedido, consulta o provedor — se
 * o pagamento entrou e o aviso se perdeu, o pedido é confirmado em vez de vencer.
 *
 * Reserva vencida já deixa de ocupar vaga no instante em que vence; esta rotina
 * só deixa o banco em dia e libera cupons e cobranças.
 */

export interface ExpirationResult {
  cartsExpired: number;
  ordersExpired: number;
  ordersRecovered: number;
}

const LOTE = 200;

export async function expireStaleSales(
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<ExpirationResult> {
  const resultado: ExpirationResult = { cartsExpired: 0, ordersExpired: 0, ordersRecovered: 0 };

  resultado.cartsExpired = await db.$executeRaw`
    UPDATE carts SET status = 'EXPIRED', updated_at = now()
    WHERE status = 'ACTIVE' AND expires_at <= ${now}`;
  await db.$executeRaw`
    UPDATE capacity_holds SET status = 'EXPIRED', updated_at = now()
    WHERE status = 'ACTIVE' AND order_id IS NULL AND expires_at <= ${now}`;

  const vencidos = await db.order.findMany({
    where: { status: 'PENDING_PAYMENT', expiresAt: { lte: now } },
    orderBy: { expiresAt: 'asc' },
    take: LOTE,
    select: { id: true },
  });

  for (const { id } of vencidos) {
    try {
      if (await recuperarPagamento(db, id)) {
        resultado.ordersRecovered += 1;
        continue;
      }

      const cobrancas = await db.$transaction(async (tx) => {
        const travado = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM orders
          WHERE id = ${id}::uuid AND status = 'PENDING_PAYMENT' AND expires_at <= ${now}
          FOR UPDATE SKIP LOCKED`;
        if (travado.length === 0) return null;

        const pedido = await tx.order.findUniqueOrThrow({
          where: { id },
          select: { parkId: true, code: true },
        });
        const ingressos = await tx.ticket.findMany({
          where: { orderId: id, status: 'PENDING_PAYMENT' },
          select: { id: true },
        });
        await tx.order.update({ where: { id }, data: { status: 'EXPIRED' } });
        await tx.ticket.updateMany({
          where: { orderId: id, status: 'PENDING_PAYMENT' },
          data: { status: 'EXPIRED' },
        });
        await tx.ticketEvent.createMany({
          data: ingressos.map((ingresso) => ({ ticketId: ingresso.id, type: 'EXPIRED' as const })),
        });
        await tx.capacityHold.updateMany({
          where: { orderId: id, status: 'ACTIVE' },
          data: { status: 'EXPIRED' },
        });
        await tx.couponUsage.updateMany({
          where: { orderId: id, status: 'RESERVED' },
          data: { status: 'RELEASED' },
        });

        const aguardando = await tx.payment.findMany({
          where: { orderId: id, status: 'AWAITING' },
          select: { id: true, provider: true, providerPaymentId: true },
        });
        for (const pagamento of aguardando) {
          await tx.payment.update({ where: { id: pagamento.id }, data: { status: 'EXPIRED' } });
          await tx.paymentTransaction.create({
            data: {
              paymentId: pagamento.id,
              kind: 'STATUS_CHANGED',
              fromStatus: 'AWAITING',
              toStatus: 'EXPIRED',
            },
          });
        }

        await recordAudit(tx, {
          action: 'orders.expired',
          parkId: pedido.parkId,
          actorType: 'SYSTEM',
          entityType: 'order',
          entityId: id,
          data: { code: pedido.code, tickets: ingressos.length },
        });
        return aguardando;
      });

      if (!cobrancas) continue;
      resultado.ordersExpired += 1;
      for (const cobranca of cobrancas) {
        if (!cobranca.providerPaymentId) continue;
        await gatewayFor(cobranca.provider)
          .cancelCharge(cobranca.providerPaymentId)
          .catch((erro: unknown) =>
            logger.warn({ err: erro, paymentId: cobranca.id }, 'falha ao cancelar cobrança vencida'),
          );
      }
    } catch (erro) {
      logger.error({ err: erro, orderId: id }, 'falha ao vencer pedido');
    }
  }

  if (resultado.cartsExpired || resultado.ordersExpired || resultado.ordersRecovered) {
    logger.info(resultado, 'rotina de vencimento de vendas');
  }
  return resultado;
}

/** Consulta as cobranças em aberto do pedido. Devolve `true` se o pagamento tinha entrado. */
async function recuperarPagamento(db: PrismaClient, orderId: string): Promise<boolean> {
  const abertas = await db.payment.findMany({
    where: { orderId, status: { in: ['AWAITING', 'PROCESSING'] } },
    select: { id: true, provider: true, status: true, providerPaymentId: true },
  });
  let pago = false;
  for (const pagamento of abertas) {
    if (!pagamento.providerPaymentId) continue;
    const situacao = await gatewayFor(pagamento.provider)
      .getCharge(pagamento.providerPaymentId)
      .catch(() => null);
    if (!situacao || situacao.status === pagamento.status || situacao.status !== 'APPROVED') continue;

    const efeito = await applyChargeSnapshot(pagamento.id, situacao, { kind: 'RECONCILED' }, db);
    pago = true;
    if (efeito.confirmedOrderId) {
      const confirmado = efeito.confirmedOrderId;
      await sendOrderConfirmedEmail(confirmado, db).catch((erro: unknown) =>
        logger.error({ err: erro, orderId: confirmado }, 'falha ao enviar e-mail de pedido confirmado'),
      );
    }
  }
  return pago;
}
