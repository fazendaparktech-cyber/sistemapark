import 'server-only';

import { formatBRL } from '@/lib/money';

import type { DbClient } from '../db';
import { logger } from '../logger';
import { notify } from './service';

/**
 * Problemas que a equipe precisa ver no sino do painel, além do log: pagamento
 * com problema, ingresso não emitido e falha de envio. Registrar o aviso nunca
 * derruba quem chamou.
 */

interface PedidoDoAviso {
  id: string;
  parkId: string;
  code: string;
  buyerName: string;
}

function linkDaVenda(pedido: { id: string }): string {
  return `/admin/vendas/${pedido.id}`;
}

async function carregarPedido(db: DbClient, orderId: string): Promise<PedidoDoAviso | null> {
  return db.order.findUnique({
    where: { id: orderId },
    select: { id: true, parkId: true, code: true, buyerName: true },
  });
}

const EMAILS = {
  CONFIRMED: 'com os ingressos',
  RECEIVED: 'de pedido recebido',
  CANCELLED: 'de cancelamento',
  REFUNDED: 'de reembolso',
} as const;

export type OrderEmailKind = keyof typeof EMAILS;

/** E-mail do pedido que não saiu: aviso para quem pode reenviar. */
export async function reportEmailFailure(
  db: DbClient,
  orderId: string,
  kind: OrderEmailKind,
  erro: unknown,
): Promise<void> {
  logger.error({ err: erro, orderId, kind }, `falha ao enviar e-mail ${EMAILS[kind]}`);
  try {
    const pedido = await carregarPedido(db, orderId);
    if (!pedido) return;
    await notify(db, {
      parkId: pedido.parkId,
      type: 'EMAIL_FAILURE',
      severity: 'WARNING',
      title: `E-mail não enviado: pedido ${pedido.code}`,
      body: `O e-mail ${EMAILS[kind]} para ${pedido.buyerName} falhou. Reenvie pela venda ou mande o link pelo WhatsApp.`,
      href: linkDaVenda(pedido),
      permission: 'orders.resend',
      dedupeKey: `email:${pedido.id}:${kind}`,
    });
  } catch (falha) {
    logger.error({ err: falha, orderId }, 'falha ao registrar aviso de e-mail');
  }
}

/** Cobrança PIX que o provedor não criou. */
export async function reportPixFailure(db: DbClient, orderId: string, erro: unknown): Promise<void> {
  logger.error({ err: erro, orderId }, 'pedido sem cobrança PIX');
  try {
    const pedido = await carregarPedido(db, orderId);
    if (!pedido) return;
    await notify(db, {
      parkId: pedido.parkId,
      type: 'PAYMENT_PROBLEM',
      severity: 'WARNING',
      title: `PIX não gerado: pedido ${pedido.code}`,
      body: `O provedor de pagamento não criou a cobrança de ${pedido.buyerName}. Dá para gerar de novo pela página do pedido; se repetir, confira a integração de pagamento.`,
      href: linkDaVenda(pedido),
      permission: 'orders.view',
      dedupeKey: `pix:${pedido.id}`,
    });
  } catch (falha) {
    logger.error({ err: falha, orderId }, 'falha ao registrar aviso de PIX');
  }
}

/** Pagamento que chegou para um pedido já cancelado. Roda dentro da transação do pagamento. */
export function alertPaidAfterCancel(db: DbClient, pedido: PedidoDoAviso): Promise<void> {
  return notify(db, {
    parkId: pedido.parkId,
    type: 'PAYMENT_PROBLEM',
    severity: 'CRITICAL',
    title: `Pagamento em pedido cancelado: ${pedido.code}`,
    body: `${pedido.buyerName} pagou um pedido que já estava cancelado. Devolva o valor ao cliente.`,
    href: linkDaVenda(pedido),
    permission: 'finance.view',
    dedupeKey: `pago-apos-cancelamento:${pedido.id}`,
  });
}

/** Pagamento fora do prazo sem vaga no dia: pago, mas sem ingresso emitido. */
export function alertPaidWithoutTickets(db: DbClient, pedido: PedidoDoAviso): Promise<void> {
  return notify(db, {
    parkId: pedido.parkId,
    type: 'TICKET_EMISSION',
    severity: 'CRITICAL',
    title: `Pago sem ingresso emitido: ${pedido.code}`,
    body: `O PIX de ${pedido.buyerName} chegou depois do prazo e o dia não tinha mais vagas, então os ingressos não foram emitidos. Devolva o valor ao cliente.`,
    href: linkDaVenda(pedido),
    permission: 'finance.view',
    dedupeKey: `pago-sem-ingresso:${pedido.id}`,
  });
}

/** Provedor informou pagamento com valor diferente da cobrança: o pedido não é confirmado. */
export async function alertAmountMismatch(
  db: DbClient,
  pagamento: { id: string; orderId: string; amountCents: number },
  recebidoCents: number,
): Promise<void> {
  const pedido = await carregarPedido(db, pagamento.orderId);
  if (!pedido) return;
  await notify(db, {
    parkId: pedido.parkId,
    type: 'PAYMENT_PROBLEM',
    severity: 'CRITICAL',
    title: `Valor pago diferente: pedido ${pedido.code}`,
    body: `Cobrança de ${formatBRL(pagamento.amountCents)}, provedor informou ${formatBRL(recebidoCents)}. O pedido de ${pedido.buyerName} não foi confirmado: confira no provedor de pagamento.`,
    href: linkDaVenda(pedido),
    permission: 'finance.view',
    dedupeKey: `valor-diferente:${pagamento.id}`,
  });
}
