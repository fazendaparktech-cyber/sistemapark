import { cpfSchema, requiredPhoneSchema } from './person-schemas';
import { emailSchema, personNameSchema, uuidSchema, z } from './validation';

/** Pedidos, ingressos e pagamentos: rótulos, códigos e o formulário de compra. */

export const ORDER_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED'] as const;
export type OrderStatusKey = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatusKey, string>> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
};

export const FINANCIAL_STATUSES = [
  'UNPAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'NOT_APPLICABLE',
] as const;
export type FinancialStatusKey = (typeof FINANCIAL_STATUSES)[number];

export const FINANCIAL_STATUS_LABELS: Readonly<Record<FinancialStatusKey, string>> = {
  UNPAID: 'Não pago',
  PAID: 'Pago',
  PARTIALLY_REFUNDED: 'Reembolsado em parte',
  REFUNDED: 'Reembolsado',
  NOT_APPLICABLE: 'Sem cobrança',
};

export const ORDER_CHANNELS = ['ONLINE', 'POS', 'COURTESY', 'ADMIN'] as const;
export type OrderChannelKey = (typeof ORDER_CHANNELS)[number];

export const ORDER_CHANNEL_LABELS: Readonly<Record<OrderChannelKey, string>> = {
  ONLINE: 'Site',
  POS: 'Bilheteria',
  COURTESY: 'Cortesia',
  ADMIN: 'Painel',
};

export const PAYMENT_METHODS = [
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'CASH',
  'CARD_TERMINAL',
  'COURTESY',
] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethodKey, string>> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  CASH: 'Dinheiro',
  CARD_TERMINAL: 'Maquininha',
  COURTESY: 'Cortesia',
};

export const PAYMENT_STATUSES = [
  'AWAITING',
  'PROCESSING',
  'APPROVED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'CHARGEBACK',
] as const;
export type PaymentStatusKey = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatusKey, string>> = {
  AWAITING: 'Aguardando',
  PROCESSING: 'Em processamento',
  APPROVED: 'Aprovado',
  DECLINED: 'Recusado',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
  PARTIALLY_REFUNDED: 'Reembolsado em parte',
  REFUNDED: 'Reembolsado',
  CHARGEBACK: 'Contestado',
};

export const TICKET_STATUSES = [
  'PENDING_PAYMENT',
  'ACTIVE',
  'CHECKED_IN',
  'CANCELLED',
  'REFUNDED',
  'EXPIRED',
] as const;
export type TicketStatusKey = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Readonly<Record<TicketStatusKey, string>> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  ACTIVE: 'Válido',
  CHECKED_IN: 'Utilizado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
  EXPIRED: 'Expirado',
};

/**
 * Situação real do pedido: um pedido aguardando pagamento cujo prazo passou já
 * está expirado, mesmo antes da rotina de limpeza marcar no banco.
 */
export function effectiveOrderStatus(
  order: { status: OrderStatusKey; expiresAt: Date | null },
  now: Date = new Date(),
): OrderStatusKey {
  if (order.status === 'PENDING_PAYMENT' && order.expiresAt && order.expiresAt <= now) return 'EXPIRED';
  return order.status;
}

// ─── Código do pedido ───────────────────────────────────────────────────────

const CODIGO_DO_PEDIDO = /^[A-Z]{1,6}-\d{4}-\d{6,}$/;

/** ("CP", 2026, 128) → "CP-2026-000128". */
export function formatOrderCode(prefix: string, year: number, value: number): string {
  return `${prefix}-${year}-${value.toString().padStart(6, '0')}`;
}

/** Aceita o código digitado com espaços ou minúsculas; devolve `null` se não tiver o formato. */
export function normalizeOrderCode(input: string): string | null {
  const codigo = input.trim().toUpperCase().replace(/\s+/g, '');
  return CODIGO_DO_PEDIDO.test(codigo) ? codigo : null;
}

// ─── Formulário de compra ───────────────────────────────────────────────────

/** Dados de um visitante; o que é obrigatório depende do tipo de ingresso. */
export const holderInputSchema = z.strictObject({
  ticketTypeId: uuidSchema,
  name: z.string().trim().max(120, 'Nome muito longo').nullish(),
  birthDate: z.string().max(10).nullish(),
  cpf: z.string().max(20).nullish(),
});

export type HolderInput = z.input<typeof holderInputSchema>;

function textoDeOrigem(maximo: number) {
  return z
    .string()
    .trim()
    .nullish()
    .transform((valor) => (valor ? valor.slice(0, maximo) : null));
}

export const attributionSchema = z
  .strictObject({
    utmSource: textoDeOrigem(100),
    utmMedium: textoDeOrigem(100),
    utmCampaign: textoDeOrigem(100),
    utmContent: textoDeOrigem(100),
    utmTerm: textoDeOrigem(100),
    referrer: textoDeOrigem(300),
  })
  .partial();

export type AttributionInput = z.input<typeof attributionSchema>;

export const checkoutInputSchema = z.strictObject({
  buyer: z.strictObject({
    name: personNameSchema,
    email: emailSchema,
    phone: requiredPhoneSchema,
    cpf: cpfSchema,
  }),
  /** Um por ingresso, agrupados pelo tipo, na ordem em que aparecem no formulário. */
  holders: z.array(holderInputSchema).max(200),
  couponCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(30, 'Código de cupom inválido')
    .nullish()
    .transform((valor) => (valor ? valor : null)),
  marketingOptIn: z.boolean(),
  acceptTerms: z.literal(true, {
    error: 'Para continuar, aceite os termos de compra e a política de cancelamento',
  }),
  /** Gerado no navegador a cada tentativa: repetir o envio não cria outro pedido. */
  idempotencyKey: uuidSchema,
  attribution: attributionSchema.nullish(),
});

export type CheckoutInput = z.input<typeof checkoutInputSchema>;

/** Motivo obrigatório para cancelar ou reembolsar pelo painel. */
export const orderReasonSchema = z.strictObject({
  reason: z
    .string({ error: 'Escreva o motivo' })
    .trim()
    .min(5, 'Escreva o motivo com pelo menos 5 caracteres')
    .max(300, 'Use no máximo 300 caracteres'),
});

export type OrderReasonInput = z.input<typeof orderReasonSchema>;
