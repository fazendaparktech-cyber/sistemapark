import { describe, expect, it } from 'vitest';

import {
  couponRejectionMessage,
  evaluateCoupon,
  type CouponContext,
  type CouponDefinition,
} from '@/lib/coupons';

const CUPOM: CouponDefinition = {
  discountType: 'PERCENT',
  percentBps: 1000,
  amountCents: null,
  maxDiscountCents: null,
  minOrderCents: null,
  startsAt: null,
  endsAt: null,
  visitFrom: null,
  visitUntil: null,
  weekdays: [],
  maxUses: null,
  maxUsesPerCustomer: null,
  firstPurchaseOnly: false,
  channels: ['ONLINE', 'POS'],
  ticketTypeIds: [],
  isActive: true,
};

const COMPRA: CouponContext = {
  now: new Date('2026-09-13T15:00:00Z'),
  visitDate: '2026-09-19',
  channel: 'ONLINE',
  items: [
    { ticketTypeId: 'adulto', totalCents: 14000 },
    { ticketTypeId: 'crianca', totalCents: 4500 },
  ],
  totalUses: 0,
  customerUses: 0,
  customerHasPurchased: false,
};

function recusa(cupom: Partial<CouponDefinition>, compra: Partial<CouponContext> = {}) {
  const resultado = evaluateCoupon({ ...CUPOM, ...cupom }, { ...COMPRA, ...compra });
  return resultado.ok ? null : resultado.reason;
}

describe('cálculo do desconto', () => {
  it('percentual sobre o total dos ingressos', () => {
    expect(evaluateCoupon(CUPOM, COMPRA)).toEqual({ ok: true, discountCents: 1850, eligibleCents: 18500 });
  });

  it('valor fixo, limitado ao que pode ser descontado', () => {
    expect(
      evaluateCoupon({ ...CUPOM, discountType: 'FIXED', percentBps: null, amountCents: 2000 }, COMPRA),
    ).toMatchObject({ ok: true, discountCents: 2000 });
    expect(
      evaluateCoupon({ ...CUPOM, discountType: 'FIXED', percentBps: null, amountCents: 50000 }, COMPRA),
    ).toMatchObject({ ok: true, discountCents: 18500 });
  });

  it('respeita o teto de desconto', () => {
    expect(evaluateCoupon({ ...CUPOM, percentBps: 5000, maxDiscountCents: 5000 }, COMPRA)).toMatchObject({
      ok: true,
      discountCents: 5000,
    });
  });

  it('só desconta dos tipos de ingresso escolhidos no cupom', () => {
    expect(evaluateCoupon({ ...CUPOM, percentBps: 2000, ticketTypeIds: ['crianca'] }, COMPRA)).toEqual({
      ok: true,
      discountCents: 900,
      eligibleCents: 4500,
    });
  });
});

describe('quando o cupom não vale', () => {
  it('ativo, período e canal', () => {
    expect(recusa({ isActive: false })).toBe('INACTIVE');
    expect(recusa({ startsAt: new Date('2026-09-20T00:00:00Z') })).toBe('NOT_STARTED');
    expect(recusa({ endsAt: new Date('2026-09-13T15:00:00Z') })).toBe('ENDED');
    expect(recusa({ channels: ['POS'] })).toBe('CHANNEL');
  });

  it('data e dia da semana da visita', () => {
    expect(recusa({ visitFrom: '2026-10-01' })).toBe('VISIT_DATE');
    expect(recusa({ visitUntil: '2026-09-18' })).toBe('VISIT_DATE');
    expect(recusa({ weekdays: [1, 2, 3, 4, 5] })).toBe('WEEKDAY');
    expect(recusa({ weekdays: [6] })).toBeNull();
  });

  it('limites de uso, identificação e primeira compra', () => {
    expect(recusa({ maxUses: 10 }, { totalUses: 10 })).toBe('MAX_USES');
    expect(recusa({ maxUses: 10 }, { totalUses: 9 })).toBeNull();
    expect(recusa({ maxUsesPerCustomer: 1 }, { customerUses: null, customerHasPurchased: null })).toBe(
      'CUSTOMER_REQUIRED',
    );
    expect(recusa({ maxUsesPerCustomer: 1 }, { customerUses: 1 })).toBe('MAX_USES_PER_CUSTOMER');
    expect(recusa({ firstPurchaseOnly: true }, { customerHasPurchased: true })).toBe('FIRST_PURCHASE_ONLY');
  });

  it('valor mínimo e itens elegíveis', () => {
    expect(recusa({ minOrderCents: 20000 })).toBe('MIN_ORDER');
    expect(recusa({ ticketTypeIds: ['vip'] })).toBe('NO_ELIGIBLE_ITEMS');
    expect(recusa({}, { items: [{ ticketTypeId: 'colo', totalCents: 0 }] })).toBe('NO_ELIGIBLE_ITEMS');
  });

  it('explica o motivo em português', () => {
    expect(couponRejectionMessage('MIN_ORDER', { minOrderCents: 20000 })).toBe(
      'Este cupom vale para compras a partir de R$\u00A0200,00.',
    );
    expect(couponRejectionMessage('MAX_USES')).toBe('Este cupom já atingiu o limite de usos.');
  });
});
