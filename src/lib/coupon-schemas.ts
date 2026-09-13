import { SALES_CHANNELS } from './catalog';
import { formatBRL } from './money';
import { optionalDateOnlySchema, optionalText } from './person-schemas';
import { uuidSchema, z } from './validation';

/** Cupons de desconto: formulário do painel e textos de exibição. */

export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

export const couponCodeSchema = z
  .string({ error: 'Informe o código' })
  .trim()
  .toUpperCase()
  .regex(COUPON_CODE_PATTERN, 'Use de 3 a 30 caracteres: letras sem acento, números, hífen ou sublinhado');

function limite(maximo: number) {
  return z
    .number()
    .int()
    .min(1, 'Use um número maior que zero')
    .max(maximo, `Use no máximo ${maximo}`)
    .nullable();
}

function centavos() {
  return z.number().int().min(1, 'Use um valor maior que zero').max(1_000_000, 'Valor muito alto').nullable();
}

export const couponInputSchema = z
  .strictObject({
    code: couponCodeSchema,
    description: optionalText(200),
    discountType: z.enum(['PERCENT', 'FIXED'], { error: 'Escolha o tipo de desconto' }),
    /** Pontos-base: 1000 = 10%. */
    percentBps: z.number().int().min(1, 'Use pelo menos 0,01%').max(10_000, 'Use no máximo 100%').nullable(),
    amountCents: centavos(),
    maxDiscountCents: centavos(),
    minOrderCents: centavos(),
    /** Dias do parque, com as duas pontas incluídas. */
    startsOn: optionalDateOnlySchema,
    endsOn: optionalDateOnlySchema,
    visitFrom: optionalDateOnlySchema,
    visitUntil: optionalDateOnlySchema,
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .transform((dias) => [...new Set(dias)].sort()),
    maxUses: limite(1_000_000),
    maxUsesPerCustomer: limite(1_000),
    firstPurchaseOnly: z.boolean(),
    channels: z
      .array(z.enum(SALES_CHANNELS))
      .min(1, 'Escolha onde o cupom vale')
      .transform((canais) => [...new Set(canais)]),
    ticketTypeIds: z
      .array(uuidSchema)
      .max(50)
      .transform((ids) => [...new Set(ids)]),
    isActive: z.boolean(),
  })
  .superRefine((valores, ctx) => {
    if (valores.discountType === 'PERCENT' && valores.percentBps === null) {
      ctx.addIssue({ code: 'custom', path: ['percentBps'], message: 'Informe o percentual de desconto' });
    }
    if (valores.discountType === 'FIXED' && valores.amountCents === null) {
      ctx.addIssue({ code: 'custom', path: ['amountCents'], message: 'Informe o valor do desconto' });
    }
    if (valores.startsOn && valores.endsOn && valores.startsOn > valores.endsOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsOn'],
        message: 'O fim precisa ser igual ou depois do início',
      });
    }
    if (valores.visitFrom && valores.visitUntil && valores.visitFrom > valores.visitUntil) {
      ctx.addIssue({
        code: 'custom',
        path: ['visitUntil'],
        message: 'O fim precisa ser igual ou depois do início',
      });
    }
    if (
      valores.maxUses !== null &&
      valores.maxUsesPerCustomer !== null &&
      valores.maxUsesPerCustomer > valores.maxUses
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxUsesPerCustomer'],
        message: 'O limite por cliente não pode passar do limite total',
      });
    }
  });

export type CouponInput = z.input<typeof couponInputSchema>;

export type CouponState = 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'EXHAUSTED' | 'INACTIVE';

export const COUPON_STATE_LABELS: Readonly<Record<CouponState, string>> = {
  ACTIVE: 'Valendo',
  SCHEDULED: 'Agendado',
  ENDED: 'Encerrado',
  EXHAUSTED: 'Esgotado',
  INACTIVE: 'Desativado',
};

/** 1050 → "10,5%". */
export function formatPercentBps(bps: number): string {
  const inteiro = Math.floor(bps / 100);
  const fracao = bps % 100;
  if (fracao === 0) return `${inteiro}%`;
  return `${inteiro},${fracao.toString().padStart(2, '0').replace(/0$/, '')}%`;
}

/** "10% de desconto (até R$ 50,00)" ou "R$ 20,00 de desconto". */
export function describeCouponDiscount(coupon: {
  discountType: 'PERCENT' | 'FIXED';
  percentBps: number | null;
  amountCents: number | null;
  maxDiscountCents: number | null;
}): string {
  if (coupon.discountType === 'FIXED') return `${formatBRL(coupon.amountCents ?? 0)} de desconto`;
  const base = `${formatPercentBps(coupon.percentBps ?? 0)} de desconto`;
  return coupon.maxDiscountCents ? `${base} (até ${formatBRL(coupon.maxDiscountCents)})` : base;
}
