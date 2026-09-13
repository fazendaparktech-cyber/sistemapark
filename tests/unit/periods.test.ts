import { describe, expect, it } from 'vitest';

import { parsePeriod, percentChange, previousRange, resolvePeriod } from '@/lib/periods';
import { slugify } from '@/lib/slug';

const HOJE = '2026-09-13';

describe('períodos', () => {
  it('resolve os atalhos em dias do parque', () => {
    expect(resolvePeriod('hoje', HOJE)).toEqual({ from: HOJE, to: HOJE });
    expect(resolvePeriod('ontem', HOJE)).toEqual({ from: '2026-09-12', to: '2026-09-12' });
    expect(resolvePeriod('7d', HOJE)).toEqual({ from: '2026-09-07', to: HOJE });
    expect(resolvePeriod('30d', HOJE)).toEqual({ from: '2026-08-15', to: HOJE });
    expect(resolvePeriod('mes', HOJE)).toEqual({ from: '2026-09-01', to: HOJE });
    expect(resolvePeriod('mes-anterior', HOJE)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(resolvePeriod('mes-anterior', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolvePeriod('ano', HOJE)).toEqual({ from: '2026-01-01', to: HOJE });
  });

  it('compara com o período anterior de mesmo tamanho', () => {
    expect(previousRange({ from: '2026-09-07', to: '2026-09-13' })).toEqual({
      from: '2026-08-31',
      to: '2026-09-06',
    });
    expect(previousRange({ from: HOJE, to: HOJE })).toEqual({ from: '2026-09-12', to: '2026-09-12' });
  });

  it('lê o período da URL, com personalizado limitado e padrão seguro', () => {
    expect(parsePeriod({ periodo: '7d' }, HOJE).key).toBe('7d');
    expect(parsePeriod({ periodo: 'qualquer' }, HOJE).key).toBe('30d');
    expect(parsePeriod({ periodo: 'personalizado', de: '2026-09-20', ate: '2026-09-01' }, HOJE)).toEqual({
      key: 'personalizado',
      range: { from: '2026-09-01', to: '2026-09-20' },
    });
    expect(parsePeriod({ periodo: 'personalizado', de: '2020-01-01', ate: '2026-09-01' }, HOJE).key).toBe(
      '30d',
    );
    expect(parsePeriod({ periodo: 'personalizado', de: 'ontem', ate: HOJE }, HOJE).key).toBe('30d');
  });

  it('calcula a variação percentual', () => {
    expect(percentChange(150, 100)).toBe(0.5);
    expect(percentChange(50, 100)).toBe(-0.5);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(10, 0)).toBeNull();
  });
});

describe('slug', () => {
  it('gera identificadores sem acento', () => {
    expect(slugify('Meia-entrada Estudante')).toBe('meia-entrada-estudante');
    expect(slugify('  Criança de colo (até 4 anos) ')).toBe('crianca-de-colo-ate-4-anos');
    expect(slugify('VIP & Cabana')).toBe('vip-cabana');
  });
});
