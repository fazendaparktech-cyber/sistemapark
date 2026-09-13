import { weekdayOf, type DateOnly } from './dates';

/** Nomes de dias e meses em português, sem depender do idioma do aparelho. */

export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

export const WEEKDAY_SHORT_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export const MONTH_LABELS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** "2026-10-12" → "segunda-feira, 12 de outubro de 2026". */
export function formatDateLong(date: DateOnly): string {
  const [ano, mes, dia] = date.split('-').map(Number);
  const semana = WEEKDAY_LABELS[weekdayOf(date)] ?? '';
  return `${semana.toLowerCase()}, ${dia} de ${MONTH_LABELS[(mes ?? 1) - 1]} de ${ano}`;
}

/** "2026-10-12" → "12 de outubro". */
export function formatDayMonth(date: DateOnly): string {
  const [, mes, dia] = date.split('-').map(Number);
  return `${dia} de ${MONTH_LABELS[(mes ?? 1) - 1]}`;
}

/** "2026-10-12" → "12/10". */
export function formatShortDate(date: DateOnly): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** "2026-10" → "outubro de 2026". */
export function formatMonthYear(month: string): string {
  const [ano, mes] = month.split('-').map(Number);
  return `${MONTH_LABELS[(mes ?? 1) - 1]} de ${ano}`;
}

/** [1, 2, 3, 4, 5] → "Seg a Sex"; [0, 6] → "Dom e Sáb"; [] → "Todos os dias". */
export function describeWeekdays(dias: readonly number[]): string {
  const unicos = [...new Set(dias)].filter((dia) => dia >= 0 && dia <= 6).sort();
  if (unicos.length === 0 || unicos.length === 7) return 'Todos os dias';
  const nomes = unicos.map((dia) => WEEKDAY_SHORT_LABELS[dia] ?? '');
  const sequencia = unicos.every((dia, i) => i === 0 || dia === (unicos[i - 1] ?? 0) + 1);
  if (sequencia && unicos.length >= 3) return `${nomes[0]} a ${nomes.at(-1)}`;
  if (nomes.length === 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}
