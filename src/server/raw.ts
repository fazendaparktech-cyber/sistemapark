import 'server-only';

import { dbToDateOnly, type DateOnly } from '@/lib/dates';

/** Conversões de valores lidos com `$queryRaw` (bigint, date). */

export function rawNumber(valor: bigint | number | string | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  return Number(valor);
}

export function rawDateOnly(valor: Date | string | null | undefined): DateOnly | null {
  if (!valor) return null;
  return typeof valor === 'string' ? valor.slice(0, 10) : dbToDateOnly(valor);
}
