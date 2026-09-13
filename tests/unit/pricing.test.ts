import { describe, expect, it } from 'vitest';

import { dayKindOf, resolvePrice, type PriceRule } from '@/lib/pricing';

const agora = new Date('2026-09-13T15:00:00Z');

function regra(parcial: Partial<PriceRule> & Pick<PriceRule, 'id' | 'priceCents'>): PriceRule {
  return {
    name: parcial.id,
    compareAtCents: null,
    dayKinds: [],
    visitFrom: null,
    visitUntil: null,
    saleStartsAt: null,
    saleEndsAt: null,
    lotQuantity: null,
    priority: 0,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...parcial,
  };
}

const ADULTO = { basePriceCents: 5000 };
const REGRAS = [
  regra({ id: 'fim-de-semana', priceCents: 7000, dayKinds: ['WEEKEND'] }),
  regra({ id: 'feriado', priceCents: 8000, dayKinds: ['HOLIDAY'] }),
];

describe('tipo do dia', () => {
  it('usa o dia da semana e respeita a marcação manual', () => {
    expect(dayKindOf('2026-09-14')).toBe('WEEKDAY');
    expect(dayKindOf('2026-09-13')).toBe('WEEKEND');
    expect(dayKindOf('2026-09-19')).toBe('WEEKEND');
    expect(dayKindOf('2026-09-14', 'HOLIDAY')).toBe('HOLIDAY');
  });
});

describe('resolvePrice', () => {
  it('dia útil sem regra usa o preço base', () => {
    expect(resolvePrice({ ...ADULTO, rules: REGRAS, visitDate: '2026-09-15', now: agora })).toEqual({
      priceCents: 5000,
      compareAtCents: null,
      ruleId: null,
      label: null,
    });
  });

  it('segue o exemplo da especificação: R$ 50 dia útil, R$ 70 fim de semana, R$ 80 feriado', () => {
    expect(resolvePrice({ ...ADULTO, rules: REGRAS, visitDate: '2026-09-15', now: agora }).priceCents).toBe(
      5000,
    );
    expect(resolvePrice({ ...ADULTO, rules: REGRAS, visitDate: '2026-09-19', now: agora }).priceCents).toBe(
      7000,
    );
    expect(
      resolvePrice({
        ...ADULTO,
        rules: REGRAS,
        visitDate: '2026-09-07',
        dayKindOverride: 'HOLIDAY',
        now: agora,
      }).priceCents,
    ).toBe(8000);
  });

  it('feriado sem regra própria usa a regra do dia da semana', () => {
    const soFimDeSemana = [regra({ id: 'fim-de-semana', priceCents: 7000, dayKinds: ['WEEKEND'] })];
    expect(
      resolvePrice({
        ...ADULTO,
        rules: soFimDeSemana,
        visitDate: '2026-11-15',
        dayKindOverride: 'HOLIDAY',
        now: agora,
      }).ruleId,
    ).toBe('fim-de-semana');
  });

  it('prioridade maior vence, mesmo sendo regra geral', () => {
    const campanha = regra({
      id: 'campanha',
      priceCents: 4000,
      priority: 10,
      saleEndsAt: new Date('2026-09-30T03:00:00Z'),
    });
    expect(
      resolvePrice({ ...ADULTO, rules: [...REGRAS, campanha], visitDate: '2026-09-19', now: agora }).ruleId,
    ).toBe('campanha');
  });

  it('respeita a janela de venda e o período da visita', () => {
    const antecipada = regra({
      id: 'antecipada',
      priceCents: 6000,
      dayKinds: ['WEEKEND'],
      priority: 1,
      saleEndsAt: new Date('2026-09-10T00:00:00Z'),
    });
    expect(
      resolvePrice({ ...ADULTO, rules: [...REGRAS, antecipada], visitDate: '2026-09-19', now: agora }).ruleId,
    ).toBe('fim-de-semana');

    const altaTemporada = regra({
      id: 'alta-temporada',
      priceCents: 9000,
      priority: 5,
      visitFrom: '2026-12-20',
      visitUntil: '2027-01-31',
    });
    expect(
      resolvePrice({ ...ADULTO, rules: [altaTemporada], visitDate: '2026-12-25', now: agora }).ruleId,
    ).toBe('alta-temporada');
    expect(
      resolvePrice({ ...ADULTO, rules: [altaTemporada], visitDate: '2026-12-19', now: agora }).ruleId,
    ).toBeNull();
    expect(
      resolvePrice({ ...ADULTO, rules: [altaTemporada], visitDate: '2027-02-01', now: agora }).ruleId,
    ).toBeNull();
  });

  it('lote esgotado deixa de valer, considerando a quantidade da compra', () => {
    const lote = regra({ id: 'lote-1', priceCents: 4500, priority: 20, lotQuantity: 100 });
    const vendidos = new Map([['lote-1', 98]]);
    const base = { ...ADULTO, rules: [lote], visitDate: '2026-09-15', now: agora, soldByRule: vendidos };
    expect(resolvePrice({ ...base, quantity: 2 }).ruleId).toBe('lote-1');
    expect(resolvePrice({ ...base, quantity: 3 }).ruleId).toBeNull();
  });

  it('regra inativa não vale; empate de prioridade vai para a mais ligada ao dia', () => {
    const inativa = regra({ id: 'inativa', priceCents: 1000, isActive: false });
    expect(
      resolvePrice({ ...ADULTO, rules: [inativa], visitDate: '2026-09-15', now: agora }).ruleId,
    ).toBeNull();

    const geral = regra({ id: 'geral', priceCents: 5500 });
    const diaUtil = regra({ id: 'dia-util', priceCents: 5200, dayKinds: ['WEEKDAY'] });
    expect(
      resolvePrice({ ...ADULTO, rules: [geral, diaUtil], visitDate: '2026-09-15', now: agora }).ruleId,
    ).toBe('dia-util');
  });

  it('devolve o preço riscado e o nome da regra', () => {
    const promocao = regra({
      id: 'promo',
      name: 'Promoção de setembro',
      priceCents: 6000,
      compareAtCents: 7000,
      dayKinds: ['WEEKEND'],
      priority: 2,
    });
    expect(resolvePrice({ ...ADULTO, rules: [promocao], visitDate: '2026-09-19', now: agora })).toEqual({
      priceCents: 6000,
      compareAtCents: 7000,
      ruleId: 'promo',
      label: 'Promoção de setembro',
    });
  });
});
