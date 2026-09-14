import 'server-only';

import { addDays, zonedTimeToInstant, type DateOnly } from '@/lib/dates';
import { PAYMENT_GROUPS, paymentGroupOf, type PaymentGroupKey, type PaymentMethodKey } from '@/lib/orders';
import { percentChange, previousRange, rangeLength, type DateRange, type ParsedPeriod } from '@/lib/periods';

import { requirePermission, type AuthContext } from '../auth/context';
import type { Kpi } from '../dashboard/metrics';
import { prisma, type DbClient } from '../db';
import { rawNumber } from '../raw';

/**
 * Financeiro. Receita bruta: pagamentos aprovados no período (pela data do
 * pagamento). Reembolsos: devoluções feitas no período (pela data da
 * devolução). Taxas: cobradas pelo provedor nos pagamentos do período.
 * Receita líquida = bruta − reembolsos − taxas. Cortesia não entra.
 */

export interface FinanceMethodRow {
  method: PaymentMethodKey;
  payments: number;
  grossCents: number;
  refundsCents: number;
  feesCents: number;
  netCents: number;
}

export interface FinanceDayRow {
  date: DateOnly;
  paidOrders: number;
  grossCents: number;
  refundsCents: number;
  feesCents: number;
  netCents: number;
  discountsCents: number;
}

export async function financeByMethod(
  db: DbClient,
  parkId: string,
  inicio: Date,
  fim: Date,
): Promise<FinanceMethodRow[]> {
  const [brutos, reembolsos] = await Promise.all([
    db.$queryRaw<
      { method: PaymentMethodKey; payments: number; gross: bigint | number; fees: bigint | number }[]
    >`
      SELECT method::text AS method, COUNT(*)::int AS payments,
        COALESCE(SUM(amount_cents), 0)::bigint AS gross,
        COALESCE(SUM(fee_cents), 0)::bigint AS fees
      FROM payments
      WHERE park_id = ${parkId}::uuid AND status IN ('APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND method <> 'COURTESY' AND approved_at >= ${inicio} AND approved_at < ${fim}
      GROUP BY method`,
    db.$queryRaw<{ method: PaymentMethodKey; refunds: bigint | number }[]>`
      SELECT p.method::text AS method, COALESCE(SUM(p.refunded_cents), 0)::bigint AS refunds
      FROM payments p
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          (SELECT MIN(t.created_at) FROM payment_transactions t
            WHERE t.payment_id = p.id AND t.to_status IN ('REFUNDED', 'PARTIALLY_REFUNDED')),
          p.updated_at
        ) AS em
      ) devolucao
      WHERE p.park_id = ${parkId}::uuid AND p.refunded_cents > 0 AND p.method <> 'COURTESY'
        AND devolucao.em >= ${inicio} AND devolucao.em < ${fim}
      GROUP BY p.method`,
  ]);

  const porMetodo = new Map<PaymentMethodKey, FinanceMethodRow>();
  const linha = (method: PaymentMethodKey): FinanceMethodRow => {
    const atual = porMetodo.get(method) ?? {
      method,
      payments: 0,
      grossCents: 0,
      refundsCents: 0,
      feesCents: 0,
      netCents: 0,
    };
    porMetodo.set(method, atual);
    return atual;
  };
  for (const bruto of brutos) {
    const atual = linha(bruto.method);
    atual.payments = bruto.payments;
    atual.grossCents = rawNumber(bruto.gross);
    atual.feesCents = rawNumber(bruto.fees);
  }
  for (const reembolso of reembolsos) linha(reembolso.method).refundsCents = rawNumber(reembolso.refunds);
  return [...porMetodo.values()]
    .map((item) => ({ ...item, netCents: item.grossCents - item.refundsCents - item.feesCents }))
    .sort((a, b) => b.grossCents - a.grossCents);
}

export async function financeByDay(
  db: DbClient,
  parkId: string,
  fuso: string,
  periodo: DateRange,
): Promise<FinanceDayRow[]> {
  const inicio = zonedTimeToInstant(periodo.from, '00:00', fuso);
  const fim = zonedTimeToInstant(addDays(periodo.to, 1), '00:00', fuso);
  const [brutos, reembolsos, vendas] = await Promise.all([
    db.$queryRaw<{ dia: string; gross: bigint | number; fees: bigint | number }[]>`
      SELECT to_char(approved_at AT TIME ZONE ${fuso}::text, 'YYYY-MM-DD') AS dia,
        COALESCE(SUM(amount_cents), 0)::bigint AS gross,
        COALESCE(SUM(fee_cents), 0)::bigint AS fees
      FROM payments
      WHERE park_id = ${parkId}::uuid AND status IN ('APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND method <> 'COURTESY' AND approved_at >= ${inicio} AND approved_at < ${fim}
      GROUP BY 1`,
    db.$queryRaw<{ dia: string; refunds: bigint | number }[]>`
      SELECT to_char(devolucao.em AT TIME ZONE ${fuso}::text, 'YYYY-MM-DD') AS dia,
        COALESCE(SUM(p.refunded_cents), 0)::bigint AS refunds
      FROM payments p
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          (SELECT MIN(t.created_at) FROM payment_transactions t
            WHERE t.payment_id = p.id AND t.to_status IN ('REFUNDED', 'PARTIALLY_REFUNDED')),
          p.updated_at
        ) AS em
      ) devolucao
      WHERE p.park_id = ${parkId}::uuid AND p.refunded_cents > 0 AND p.method <> 'COURTESY'
        AND devolucao.em >= ${inicio} AND devolucao.em < ${fim}
      GROUP BY 1`,
    db.$queryRaw<{ dia: string; orders: number; discounts: bigint | number }[]>`
      SELECT to_char(confirmed_at AT TIME ZONE ${fuso}::text, 'YYYY-MM-DD') AS dia,
        COUNT(*)::int AS orders,
        COALESCE(SUM(discount_cents), 0)::bigint AS discounts
      FROM orders
      WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND channel <> 'COURTESY'
        AND confirmed_at >= ${inicio} AND confirmed_at < ${fim}
      GROUP BY 1`,
  ]);
  const brutoPorDia = new Map(brutos.map((item) => [item.dia, item]));
  const reembolsoPorDia = new Map(reembolsos.map((item) => [item.dia, rawNumber(item.refunds)]));
  const vendasPorDia = new Map(vendas.map((item) => [item.dia, item]));

  return Array.from({ length: rangeLength(periodo) }, (_, indice) => {
    const data = addDays(periodo.from, indice);
    const bruto = rawNumber(brutoPorDia.get(data)?.gross);
    const taxas = rawNumber(brutoPorDia.get(data)?.fees);
    const devolvido = reembolsoPorDia.get(data) ?? 0;
    return {
      date: data,
      paidOrders: vendasPorDia.get(data)?.orders ?? 0,
      grossCents: bruto,
      refundsCents: devolvido,
      feesCents: taxas,
      netCents: bruto - devolvido - taxas,
      discountsCents: rawNumber(vendasPorDia.get(data)?.discounts),
    };
  });
}

async function vendasPagas(
  db: DbClient,
  parkId: string,
  inicio: Date,
  fim: Date,
): Promise<{ orders: number; amount: number; discounts: number }> {
  const [linha] = await db.$queryRaw<
    { orders: number; amount: bigint | number; discounts: bigint | number }[]
  >`
    SELECT COUNT(*)::int AS orders,
      COALESCE(SUM(total_cents), 0)::bigint AS amount,
      COALESCE(SUM(discount_cents), 0)::bigint AS discounts
    FROM orders
    WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND channel <> 'COURTESY'
      AND confirmed_at >= ${inicio} AND confirmed_at < ${fim}`;
  return {
    orders: linha?.orders ?? 0,
    amount: rawNumber(linha?.amount),
    discounts: rawNumber(linha?.discounts),
  };
}

export interface FinanceSummary {
  period: ParsedPeriod & { previous: DateRange };
  gross: Kpi;
  refunds: Kpi;
  fees: Kpi;
  net: Kpi;
  discounts: Kpi;
  paidOrders: Kpi;
  paidAmount: Kpi;
  /** Vendas aguardando pagamento agora, dentro do prazo. */
  pending: { orders: number; amountCents: number };
  byGroup: {
    group: PaymentGroupKey;
    payments: number;
    grossCents: number;
    refundsCents: number;
    feesCents: number;
    netCents: number;
  }[];
  byMethod: FinanceMethodRow[];
  daily: FinanceDayRow[];
  recentRefunds: {
    paymentId: string;
    orderId: string;
    orderCode: string;
    buyerName: string;
    method: PaymentMethodKey;
    amountCents: number;
    at: Date;
  }[];
}

function kpi(atual: number, anterior: number): Kpi {
  return { value: atual, previous: anterior, change: percentChange(atual, anterior) };
}

function somar(linhas: readonly FinanceMethodRow[]) {
  return linhas.reduce(
    (total, linha) => ({
      gross: total.gross + linha.grossCents,
      refunds: total.refunds + linha.refundsCents,
      fees: total.fees + linha.feesCents,
    }),
    { gross: 0, refunds: 0, fees: 0 },
  );
}

export async function getFinanceSummary(
  auth: AuthContext,
  periodo: ParsedPeriod,
  db: DbClient = prisma,
): Promise<FinanceSummary> {
  requirePermission(auth, 'finance.view');
  const parkId = auth.park.id;
  const fuso = auth.park.timezone;
  const anterior = previousRange(periodo.range);
  const instante = (data: DateOnly) => zonedTimeToInstant(data, '00:00', fuso);
  const inicio = instante(periodo.range.from);
  const fim = instante(addDays(periodo.range.to, 1));
  const inicioAnterior = instante(anterior.from);

  const [metodos, metodosAntes, pagas, pagasAntes, diario, pendentes, devolucoes] = await Promise.all([
    financeByMethod(db, parkId, inicio, fim),
    financeByMethod(db, parkId, inicioAnterior, inicio),
    vendasPagas(db, parkId, inicio, fim),
    vendasPagas(db, parkId, inicioAnterior, inicio),
    financeByDay(db, parkId, fuso, periodo.range),
    db.$queryRaw<{ orders: number; amount: bigint | number }[]>`
      SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_cents), 0)::bigint AS amount
      FROM orders
      WHERE park_id = ${parkId}::uuid AND status = 'PENDING_PAYMENT' AND expires_at > now()`,
    db.$queryRaw<
      {
        id: string;
        order_id: string;
        code: string;
        buyer_name: string;
        method: PaymentMethodKey;
        refunded_cents: number;
        em: Date;
      }[]
    >`
      SELECT p.id, p.order_id, o.code, o.buyer_name, p.method::text AS method, p.refunded_cents, devolucao.em
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          (SELECT MIN(t.created_at) FROM payment_transactions t
            WHERE t.payment_id = p.id AND t.to_status IN ('REFUNDED', 'PARTIALLY_REFUNDED')),
          p.updated_at
        ) AS em
      ) devolucao
      WHERE p.park_id = ${parkId}::uuid AND p.refunded_cents > 0 AND p.method <> 'COURTESY'
        AND devolucao.em >= ${inicio} AND devolucao.em < ${fim}
      ORDER BY devolucao.em DESC
      LIMIT 20`,
  ]);

  const total = somar(metodos);
  const totalAntes = somar(metodosAntes);
  const grupos = PAYMENT_GROUPS.map((grupo) => {
    const doGrupo = metodos.filter((linha) => paymentGroupOf(linha.method) === grupo);
    return {
      group: grupo,
      payments: doGrupo.reduce((soma, linha) => soma + linha.payments, 0),
      grossCents: doGrupo.reduce((soma, linha) => soma + linha.grossCents, 0),
      refundsCents: doGrupo.reduce((soma, linha) => soma + linha.refundsCents, 0),
      feesCents: doGrupo.reduce((soma, linha) => soma + linha.feesCents, 0),
      netCents: doGrupo.reduce((soma, linha) => soma + linha.netCents, 0),
    };
  });

  return {
    period: { ...periodo, previous: anterior },
    gross: kpi(total.gross, totalAntes.gross),
    refunds: kpi(total.refunds, totalAntes.refunds),
    fees: kpi(total.fees, totalAntes.fees),
    net: kpi(
      total.gross - total.refunds - total.fees,
      totalAntes.gross - totalAntes.refunds - totalAntes.fees,
    ),
    discounts: kpi(pagas.discounts, pagasAntes.discounts),
    paidOrders: kpi(pagas.orders, pagasAntes.orders),
    paidAmount: kpi(pagas.amount, pagasAntes.amount),
    pending: { orders: pendentes[0]?.orders ?? 0, amountCents: rawNumber(pendentes[0]?.amount) },
    byGroup: grupos,
    byMethod: metodos,
    daily: diario,
    recentRefunds: devolucoes.map((linha) => ({
      paymentId: linha.id,
      orderId: linha.order_id,
      orderCode: linha.code,
      buyerName: linha.buyer_name,
      method: linha.method,
      amountCents: linha.refunded_cents,
      at: linha.em,
    })),
  };
}
