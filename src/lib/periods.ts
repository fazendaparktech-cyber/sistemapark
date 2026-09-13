import { addDays, diffDays, isDateOnly, type DateOnly } from './dates';

/**
 * Períodos dos relatórios e do painel. Tudo em dias civis do parque; a
 * conversão para instantes acontece no servidor, com o fuso do parque.
 */

export const PERIOD_PRESETS = ['hoje', 'ontem', '7d', '30d', 'mes', 'mes-anterior', 'ano'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export type PeriodKey = PeriodPreset | 'personalizado';

export const PERIOD_LABELS: Readonly<Record<PeriodKey, string>> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  mes: 'Este mês',
  'mes-anterior': 'Mês anterior',
  ano: 'Este ano',
  personalizado: 'Personalizado',
};

/** Intervalo de dias, com as duas pontas incluídas. */
export interface DateRange {
  from: DateOnly;
  to: DateOnly;
}

export const MAX_PERIOD_DAYS = 366;

function primeiroDoMes(data: DateOnly): DateOnly {
  return `${data.slice(0, 7)}-01`;
}

export function resolvePeriod(preset: PeriodPreset, today: DateOnly): DateRange {
  switch (preset) {
    case 'hoje':
      return { from: today, to: today };
    case 'ontem': {
      const ontem = addDays(today, -1);
      return { from: ontem, to: ontem };
    }
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'mes':
      return { from: primeiroDoMes(today), to: today };
    case 'mes-anterior': {
      const ultimoDoMesAnterior = addDays(primeiroDoMes(today), -1);
      return { from: primeiroDoMes(ultimoDoMesAnterior), to: ultimoDoMesAnterior };
    }
    case 'ano':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** Período de mesmo tamanho imediatamente anterior, para comparação. */
export function previousRange(range: DateRange): DateRange {
  const dias = diffDays(range.from, range.to) + 1;
  const ate = addDays(range.from, -1);
  return { from: addDays(ate, -(dias - 1)), to: ate };
}

export function rangeLength(range: DateRange): number {
  return diffDays(range.from, range.to) + 1;
}

export interface ParsedPeriod {
  key: PeriodKey;
  range: DateRange;
}

/** Lê o período da URL (`?periodo=7d` ou `?periodo=personalizado&de=…&ate=…`). */
export function parsePeriod(
  params: { periodo?: string | null; de?: string | null; ate?: string | null },
  today: DateOnly,
  fallback: PeriodPreset = '30d',
): ParsedPeriod {
  const periodo = params.periodo ?? '';
  if (
    periodo === 'personalizado' &&
    params.de &&
    params.ate &&
    isDateOnly(params.de) &&
    isDateOnly(params.ate)
  ) {
    const range =
      params.de <= params.ate ? { from: params.de, to: params.ate } : { from: params.ate, to: params.de };
    if (rangeLength(range) <= MAX_PERIOD_DAYS) return { key: 'personalizado', range };
  }
  const preset = (PERIOD_PRESETS as readonly string[]).includes(periodo)
    ? (periodo as PeriodPreset)
    : fallback;
  return { key: preset, range: resolvePeriod(preset, today) };
}

/** Variação percentual entre dois valores. `null` quando não há base de comparação. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}
