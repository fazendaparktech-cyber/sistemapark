import { compareDateOnly, weekdayOf, type DateOnly } from './dates';

/**
 * Preço de um tipo de ingresso numa data.
 *
 * Regras de preço valem para tipos de dia (dia útil, fim de semana, feriado,
 * evento, data especial), período da visita, janela de venda e lote. Entre as
 * regras que se aplicam, vence a de maior prioridade; empatando, a que fala do
 * tipo do dia marcado à mão, depois a do dia da semana, depois a geral; empatando
 * de novo, a mais específica e, por fim, a mais antiga. Sem regra, vale o preço base.
 */

export const DAY_KINDS = ['WEEKDAY', 'WEEKEND', 'HOLIDAY', 'EVENT', 'SPECIAL'] as const;
export type DayKind = (typeof DAY_KINDS)[number];

export const DAY_KIND_LABELS: Readonly<Record<DayKind, string>> = {
  WEEKDAY: 'Dia útil',
  WEEKEND: 'Fim de semana',
  HOLIDAY: 'Feriado',
  EVENT: 'Evento',
  SPECIAL: 'Data especial',
};

/** Tipos que só existem quando marcados à mão no calendário. */
export const MANUAL_DAY_KINDS: readonly DayKind[] = ['HOLIDAY', 'EVENT', 'SPECIAL'];

export function naturalDayKind(date: DateOnly): DayKind {
  const dia = weekdayOf(date);
  return dia === 0 || dia === 6 ? 'WEEKEND' : 'WEEKDAY';
}

export function dayKindOf(date: DateOnly, override?: DayKind | null): DayKind {
  return override ?? naturalDayKind(date);
}

export interface PriceRule {
  id: string;
  name: string;
  priceCents: number;
  compareAtCents: number | null;
  dayKinds: readonly DayKind[];
  visitFrom: DateOnly | null;
  visitUntil: DateOnly | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  lotQuantity: number | null;
  priority: number;
  isActive: boolean;
  createdAt: Date;
}

export interface ResolvedPrice {
  priceCents: number;
  compareAtCents: number | null;
  ruleId: string | null;
  label: string | null;
}

export interface ResolvePriceInput {
  basePriceCents: number;
  rules: readonly PriceRule[];
  visitDate: DateOnly;
  /** Tipo marcado à mão no calendário (feriado, evento, data especial), se houver. */
  dayKindOverride?: DayKind | null;
  now: Date;
  /** Ingressos já vendidos ou reservados em cada regra com lote. */
  soldByRule?: ReadonlyMap<string, number>;
  /** Quantidade desta compra: o lote precisa comportá-la inteira. Padrão: 1. */
  quantity?: number;
}

/** Nível da regra para a data (3 = tipo marcado à mão, 2 = dia da semana, 1 = geral) ou `null` se não se aplica. */
function nivelNaData(regra: PriceRule, input: ResolvePriceInput): number | null {
  if (!regra.isActive) return null;
  if (regra.visitFrom && compareDateOnly(input.visitDate, regra.visitFrom) < 0) return null;
  if (regra.visitUntil && compareDateOnly(input.visitDate, regra.visitUntil) > 0) return null;
  if (regra.saleStartsAt && input.now < regra.saleStartsAt) return null;
  if (regra.saleEndsAt && input.now >= regra.saleEndsAt) return null;
  if (regra.lotQuantity !== null) {
    const vendidos = input.soldByRule?.get(regra.id) ?? 0;
    if (vendidos + (input.quantity ?? 1) > regra.lotQuantity) return null;
  }
  if (regra.dayKinds.length === 0) return 1;
  if (input.dayKindOverride && regra.dayKinds.includes(input.dayKindOverride)) return 3;
  if (regra.dayKinds.includes(naturalDayKind(input.visitDate))) return 2;
  return null;
}

function especificidade(regra: PriceRule): number {
  return (
    (regra.visitFrom || regra.visitUntil ? 2 : 0) +
    (regra.saleStartsAt || regra.saleEndsAt ? 1 : 0) +
    (regra.lotQuantity !== null ? 1 : 0)
  );
}

export function resolvePrice(input: ResolvePriceInput): ResolvedPrice {
  const candidatas = input.rules
    .map((regra) => ({ regra, nivel: nivelNaData(regra, input) }))
    .filter((item): item is { regra: PriceRule; nivel: number } => item.nivel !== null)
    .sort(
      (a, b) =>
        b.regra.priority - a.regra.priority ||
        b.nivel - a.nivel ||
        especificidade(b.regra) - especificidade(a.regra) ||
        a.regra.createdAt.getTime() - b.regra.createdAt.getTime() ||
        a.regra.id.localeCompare(b.regra.id),
    );

  const vencedora = candidatas[0]?.regra;
  if (!vencedora) {
    return { priceCents: input.basePriceCents, compareAtCents: null, ruleId: null, label: null };
  }
  return {
    priceCents: vencedora.priceCents,
    compareAtCents: vencedora.compareAtCents,
    ruleId: vencedora.id,
    label: vencedora.name,
  };
}
