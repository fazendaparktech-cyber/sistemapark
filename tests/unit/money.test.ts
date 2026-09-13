import { describe, expect, it } from 'vitest';

import { allocateCents, applyBps, formatBRL, parseBRL, sumCents } from '@/lib/money';

const NBSP = '\u00A0';

describe('formatBRL', () => {
  it('formata centavos no padrão brasileiro', () => {
    expect(formatBRL(125000)).toBe(`R$${NBSP}1.250,00`);
    expect(formatBRL(4990)).toBe(`R$${NBSP}49,90`);
    expect(formatBRL(5)).toBe(`R$${NBSP}0,05`);
    expect(formatBRL(0)).toBe(`R$${NBSP}0,00`);
    expect(formatBRL(123456789)).toBe(`R$${NBSP}1.234.567,89`);
  });

  it('formata valores negativos', () => {
    expect(formatBRL(-1050)).toBe(`-R$${NBSP}10,50`);
  });

  it('recusa valor que não é inteiro de centavos', () => {
    expect(() => formatBRL(49.9)).toThrow(RangeError);
    expect(() => formatBRL(Number.NaN)).toThrow(RangeError);
  });
});

describe('parseBRL', () => {
  it.each([
    ['1.250,00', 125000],
    ['1250,5', 125050],
    ['R$ 49,90', 4990],
    [`R$${NBSP}49,90`, 4990],
    ['49.90', 4990],
    ['50', 5000],
    ['1.250', 125000],
    ['1.234.567,89', 123456789],
    ['0,05', 5],
    [' 7 ', 700],
    ['-10,50', -1050],
  ])('lê %j como %i centavos', (entrada, esperado) => {
    expect(parseBRL(entrada)).toBe(esperado);
  });

  it.each(['', 'abc', '1,234', '12.34.56', '1.2345', ',50', '1,2,3', '1.25,00', '99999999999'])(
    'recusa %j',
    (entrada) => {
      expect(parseBRL(entrada)).toBeNull();
    },
  );
});

describe('applyBps', () => {
  it('aplica percentual em pontos-base com arredondamento do meio centavo', () => {
    expect(applyBps(4990, 1000)).toBe(499);
    expect(applyBps(4990, 1500)).toBe(749);
    expect(applyBps(1, 5000)).toBe(1);
    expect(applyBps(1, 4999)).toBe(0);
    expect(applyBps(4990, 10_000)).toBe(4990);
    expect(applyBps(-4990, 1500)).toBe(-749);
  });

  it('recusa pontos-base negativos ou fracionários', () => {
    expect(() => applyBps(100, -1)).toThrow(RangeError);
    expect(() => applyBps(100, 1.5)).toThrow(RangeError);
  });
});

describe('sumCents', () => {
  it('soma e confere os valores', () => {
    expect(sumCents([4990, 3500, 0])).toBe(8490);
    expect(() => sumCents([1, 0.5])).toThrow(RangeError);
  });
});

describe('allocateCents', () => {
  it('distribui sem perder nem sobrar centavo', () => {
    expect(allocateCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateCents(1000, [4990, 3500])).toEqual([588, 412]);
  });

  it('mantém a soma igual ao total em casos arbitrários', () => {
    const pesos = [7000, 7000, 4500, 3500, 0, 4500];
    for (const total of [0, 1, 99, 1001, 12345, 250000]) {
      const partes = allocateCents(total, pesos);
      expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
      expect(partes[4]).toBe(0);
    }
  });

  it('divide igualmente quando todos os pesos são zero', () => {
    expect(allocateCents(10, [0, 0])).toEqual([5, 5]);
    expect(allocateCents(7, [0, 0, 0])).toEqual([3, 2, 2]);
  });

  it('respeita o sinal do total', () => {
    expect(allocateCents(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it('recusa entrada inválida', () => {
    expect(() => allocateCents(100, [])).toThrow(RangeError);
    expect(() => allocateCents(100, [1, -1])).toThrow(RangeError);
    expect(() => allocateCents(10.5, [1])).toThrow(RangeError);
  });
});
