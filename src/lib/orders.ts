import { isValidCpf, onlyDigits } from './documents';
import { MAX_CENTS } from './money';
import { cpfSchema, dateOnlySchema, optionalText, requiredPhoneSchema } from './person-schemas';
import { emailSchema, optionalPhoneSchema, personNameSchema, uuidSchema, z } from './validation';

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
  ONLINE: 'Online',
  POS: 'Presencial',
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

// ─── Situação da venda ──────────────────────────────────────────────────────

export const SALE_STATUSES = ['PAID', 'PENDING', 'CANCELLED', 'REFUNDED'] as const;
export type SaleStatusKey = (typeof SALE_STATUSES)[number];

export const SALE_STATUS_LABELS: Readonly<Record<SaleStatusKey, string>> = {
  PAID: 'Pago',
  PENDING: 'Pendente',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

/**
 * Pedido e financeiro resumidos nas quatro situações que a equipe usa. Vencido
 * sem pagamento conta como cancelado; qualquer devolução, como reembolsado.
 */
export function saleStatusOf(
  order: { status: OrderStatusKey; financialStatus: FinancialStatusKey; expiresAt: Date | null },
  now: Date = new Date(),
): SaleStatusKey {
  if (order.financialStatus === 'REFUNDED' || order.financialStatus === 'PARTIALLY_REFUNDED')
    return 'REFUNDED';
  const status = effectiveOrderStatus(order, now);
  if (status === 'CONFIRMED') return 'PAID';
  if (status === 'PENDING_PAYMENT') return 'PENDING';
  return 'CANCELLED';
}

// ─── Formas de pagamento agrupadas ──────────────────────────────────────────

export const PAYMENT_GROUPS = ['PIX', 'CARD', 'CASH', 'OTHER'] as const;
export type PaymentGroupKey = (typeof PAYMENT_GROUPS)[number];

export const PAYMENT_GROUP_LABELS: Readonly<Record<PaymentGroupKey, string>> = {
  PIX: 'PIX',
  CARD: 'Cartão',
  CASH: 'Dinheiro',
  OTHER: 'Outros',
};

export const PAYMENT_GROUP_METHODS: Readonly<Record<PaymentGroupKey, readonly PaymentMethodKey[]>> = {
  PIX: ['PIX'],
  CARD: ['CREDIT_CARD', 'DEBIT_CARD', 'CARD_TERMINAL'],
  CASH: ['CASH'],
  OTHER: ['COURTESY'],
};

export function paymentGroupOf(method: PaymentMethodKey): PaymentGroupKey {
  for (const grupo of PAYMENT_GROUPS) if (PAYMENT_GROUP_METHODS[grupo].includes(method)) return grupo;
  return 'OTHER';
}

export const PAYMENT_PROVIDERS = ['MOCK', 'ASAAS', 'MANUAL'] as const;
export type PaymentProviderKey = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_PROVIDER_LABELS: Readonly<Record<PaymentProviderKey, string>> = {
  MOCK: 'Provedor de teste',
  ASAAS: 'Asaas',
  MANUAL: 'Recebido pela equipe',
};

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

// ─── Venda presencial ───────────────────────────────────────────────────────

export const POS_PAYMENT_METHODS = ['CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'PIX'] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

/** E-mail opcional: vazio vira `null`. */
const optionalEmailSchema = z
  .string()
  .trim()
  .max(254, 'E-mail muito longo')
  .nullish()
  .transform((valor, ctx) => {
    if (!valor) return null;
    const parsed = emailSchema.safeParse(valor);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'Informe um e-mail válido' });
      return z.NEVER;
    }
    return parsed.data;
  });

/** CPF opcional: vazio vira `null`; preenchido precisa ser válido. Devolve só os dígitos. */
const optionalCpfSchema = z
  .string()
  .max(20, 'CPF inválido')
  .nullish()
  .transform((valor, ctx) => {
    const digitos = onlyDigits(valor ?? '');
    if (!digitos) return null;
    if (!isValidCpf(digitos)) {
      ctx.addIssue({ code: 'custom', message: 'CPF inválido' });
      return z.NEVER;
    }
    return digitos;
  });

const posCouponSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(30, 'Código de cupom inválido')
  .nullish()
  .transform((valor) => (valor ? valor : null));

const posItemsSchema = z
  .array(
    z.strictObject({
      ticketTypeId: uuidSchema,
      quantity: z
        .number()
        .int('Quantidade inválida')
        .min(1, 'Quantidade inválida')
        .max(500, 'Quantidade muito alta'),
    }),
  )
  .min(1, 'Escolha pelo menos um ingresso')
  .max(30, 'Ingressos demais numa venda');

const manualDiscountSchema = z
  .number()
  .int('Desconto inválido')
  .min(0, 'Desconto inválido')
  .max(MAX_CENTS)
  .nullish()
  .transform((valor) => valor ?? 0);

/** Prévia da venda no balcão: o servidor recalcula preço, cupom e vagas a cada alteração. */
export const posQuoteSchema = z.strictObject({
  visitDate: dateOnlySchema,
  items: posItemsSchema,
  couponCode: posCouponSchema,
  manualDiscountCents: manualDiscountSchema,
  customerId: uuidSchema.nullish().transform((valor) => valor ?? null),
  buyerCpf: optionalCpfSchema,
});

export type PosQuoteInput = z.input<typeof posQuoteSchema>;

export const posSaleSchema = z.strictObject({
  visitDate: dateOnlySchema,
  items: posItemsSchema,
  couponCode: posCouponSchema,
  manualDiscountCents: manualDiscountSchema,
  discountReason: optionalText(200),
  customerId: uuidSchema.nullish().transform((valor) => valor ?? null),
  buyer: z.strictObject({
    name: personNameSchema,
    phone: optionalPhoneSchema,
    email: optionalEmailSchema,
    cpf: optionalCpfSchema,
  }),
  /** Nome, CPF e nascimento dos visitantes são opcionais no balcão; quando informados, são conferidos. */
  holders: z.array(holderInputSchema).max(500).default([]),
  paymentMethod: z.enum(POS_PAYMENT_METHODS, { error: 'Escolha a forma de pagamento' }),
  /** Dinheiro entregue pelo cliente, para calcular o troco. */
  cashReceivedCents: z
    .number()
    .int()
    .min(0)
    .max(MAX_CENTS)
    .nullish()
    .transform((valor) => valor ?? null),
  marketingOptIn: z.boolean().default(false),
  idempotencyKey: uuidSchema,
});

export type PosSaleInput = z.input<typeof posSaleSchema>;
