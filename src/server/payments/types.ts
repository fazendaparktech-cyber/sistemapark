import 'server-only';

import type { PaymentProvider, PaymentStatus } from '@/generated/prisma/client';

/**
 * Contrato com o provedor de pagamento. O resto do sistema só conversa com
 * esta interface: trocar o provedor de teste pelo real não muda pedido,
 * ingresso nem relatório.
 *
 * Regra de ouro: o status que vale é o consultado no provedor (`getCharge`),
 * nunca o que chega escrito no corpo do webhook.
 */

export interface PixChargeInput {
  /** Id do pedido no sistema. */
  reference: string;
  description: string;
  amountCents: number;
  expiresAt: Date;
  payer: { name: string; email: string | null; phone: string | null; cpfDigits: string | null };
  idempotencyKey: string;
}

export interface PixCharge {
  providerPaymentId: string;
  /** PIX copia e cola (BR Code). */
  pixPayload: string;
  expiresAt: Date;
}

export interface ChargeSnapshot {
  providerPaymentId: string;
  status: PaymentStatus;
  amountCents: number;
  refundedCents: number;
  feeCents: number | null;
  paidAt: Date | null;
}

export interface WebhookNotification {
  /** Id do evento no provedor: garante que o mesmo aviso não é processado duas vezes. */
  externalId: string;
  eventType: string;
  providerPaymentId: string | null;
}

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  createPixCharge(input: PixChargeInput): Promise<PixCharge>;
  getCharge(providerPaymentId: string): Promise<ChargeSnapshot | null>;
  cancelCharge(providerPaymentId: string): Promise<void>;
  refundCharge(providerPaymentId: string, amountCents: number): Promise<ChargeSnapshot>;
  verifyWebhook(headers: Headers, rawBody: string): boolean;
  parseWebhook(rawBody: string): WebhookNotification | null;
}
