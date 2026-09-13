import { compareDateOnly, weekdayOf, type DateOnly } from './dates';
import { applyBps, formatBRL, type Cents } from './money';

/**
 * Regras de cupom de desconto, sem banco: o serviço busca os usos e chama esta
 * função dentro da transação da compra. O desconto nunca passa do valor dos
 * ingressos elegíveis.
 */

export type CouponChannel = 'ONLINE' | 'POS';

export interface CouponDefinition {
  discountType: 'PERCENT' | 'FIXED';
  /** Pontos-base: 1000 = 10%. */
  percentBps: number | null;
  amountCents: Cents | null;
  maxDiscountCents: Cents | null;
  minOrderCents: Cents | null;
  startsAt: Date | null;
  endsAt: Date | null;
  visitFrom: DateOnly | null;
  visitUntil: DateOnly | null;
  /** 0 = domingo … 6 = sábado. Vazio: qualquer dia. */
  weekdays: readonly number[];
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  firstPurchaseOnly: boolean;
  channels: readonly CouponChannel[];
  /** Vazio: vale para todos os tipos de ingresso. */
  ticketTypeIds: readonly string[];
  isActive: boolean;
}

export interface CouponContext {
  now: Date;
  visitDate: DateOnly;
  channel: CouponChannel;
  items: readonly { ticketTypeId: string; totalCents: Cents }[];
  /** Usos que contam para o limite (reservados em pedidos válidos e confirmados). */
  totalUses: number;
  /** Usos deste cliente; `null` quando o cliente não foi identificado (sem CPF). */
  customerUses: number | null;
  /** Se o cliente já tem compra confirmada; `null` quando não foi identificado. */
  customerHasPurchased: boolean | null;
}

export type CouponRejection =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'ENDED'
  | 'CHANNEL'
  | 'VISIT_DATE'
  | 'WEEKDAY'
  | 'MAX_USES'
  | 'CUSTOMER_REQUIRED'
  | 'MAX_USES_PER_CUSTOMER'
  | 'FIRST_PURCHASE_ONLY'
  | 'MIN_ORDER'
  | 'NO_ELIGIBLE_ITEMS';

export type CouponEvaluation =
  { ok: true; discountCents: Cents; eligibleCents: Cents } | { ok: false; reason: CouponRejection };

export function couponRejectionMessage(
  reason: CouponRejection,
  coupon?: Pick<CouponDefinition, 'minOrderCents'>,
): string {
  switch (reason) {
    case 'INACTIVE':
      return 'Este cupom não está ativo.';
    case 'NOT_STARTED':
      return 'Este cupom ainda não começou a valer.';
    case 'ENDED':
      return 'Este cupom não está mais valendo.';
    case 'CHANNEL':
      return 'Este cupom não vale para este tipo de compra.';
    case 'VISIT_DATE':
      return 'Este cupom não vale para a data escolhida.';
    case 'WEEKDAY':
      return 'Este cupom não vale para este dia da semana.';
    case 'MAX_USES':
      return 'Este cupom já atingiu o limite de usos.';
    case 'CUSTOMER_REQUIRED':
      return 'Informe o CPF para usar este cupom.';
    case 'MAX_USES_PER_CUSTOMER':
      return 'Este cupom já foi usado o máximo de vezes neste CPF.';
    case 'FIRST_PURCHASE_ONLY':
      return 'Este cupom vale só para a primeira compra.';
    case 'MIN_ORDER':
      return coupon?.minOrderCents
        ? `Este cupom vale para compras a partir de ${formatBRL(coupon.minOrderCents)}.`
        : 'O valor da compra não atinge o mínimo deste cupom.';
    case 'NO_ELIGIBLE_ITEMS':
      return 'Este cupom não vale para os ingressos escolhidos.';
  }
}

function recusa(reason: CouponRejection): CouponEvaluation {
  return { ok: false, reason };
}

export function evaluateCoupon(coupon: CouponDefinition, ctx: CouponContext): CouponEvaluation {
  if (!coupon.isActive) return recusa('INACTIVE');
  if (coupon.startsAt && ctx.now < coupon.startsAt) return recusa('NOT_STARTED');
  if (coupon.endsAt && ctx.now >= coupon.endsAt) return recusa('ENDED');
  if (!coupon.channels.includes(ctx.channel)) return recusa('CHANNEL');
  if (coupon.visitFrom && compareDateOnly(ctx.visitDate, coupon.visitFrom) < 0) return recusa('VISIT_DATE');
  if (coupon.visitUntil && compareDateOnly(ctx.visitDate, coupon.visitUntil) > 0) return recusa('VISIT_DATE');
  if (coupon.weekdays.length > 0 && !coupon.weekdays.includes(weekdayOf(ctx.visitDate)))
    return recusa('WEEKDAY');
  if (coupon.maxUses !== null && ctx.totalUses >= coupon.maxUses) return recusa('MAX_USES');

  if (coupon.maxUsesPerCustomer !== null || coupon.firstPurchaseOnly) {
    if (ctx.customerUses === null) return recusa('CUSTOMER_REQUIRED');
    if (coupon.maxUsesPerCustomer !== null && ctx.customerUses >= coupon.maxUsesPerCustomer) {
      return recusa('MAX_USES_PER_CUSTOMER');
    }
    if (coupon.firstPurchaseOnly && ctx.customerHasPurchased) return recusa('FIRST_PURCHASE_ONLY');
  }

  const subtotal = ctx.items.reduce((soma, item) => soma + item.totalCents, 0);
  if (coupon.minOrderCents !== null && subtotal < coupon.minOrderCents) return recusa('MIN_ORDER');

  const elegiveis =
    coupon.ticketTypeIds.length === 0
      ? ctx.items
      : ctx.items.filter((item) => coupon.ticketTypeIds.includes(item.ticketTypeId));
  const eligibleCents = elegiveis.reduce((soma, item) => soma + item.totalCents, 0);
  if (eligibleCents <= 0) return recusa('NO_ELIGIBLE_ITEMS');

  let desconto =
    coupon.discountType === 'PERCENT'
      ? applyBps(eligibleCents, coupon.percentBps ?? 0)
      : (coupon.amountCents ?? 0);
  if (coupon.maxDiscountCents !== null) desconto = Math.min(desconto, coupon.maxDiscountCents);
  desconto = Math.max(0, Math.min(desconto, eligibleCents));

  return { ok: true, discountCents: desconto, eligibleCents };
}
