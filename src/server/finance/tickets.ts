import 'server-only';

import { addDays, todayIn, zonedTimeToInstant } from '@/lib/dates';
import { percentChange, previousRange, type DateRange, type ParsedPeriod } from '@/lib/periods';

import { requirePermission, type AuthContext } from '../auth/context';
import type { Kpi } from '../dashboard/metrics';
import { prisma, type DbClient } from '../db';
import { rawNumber } from '../raw';

/**
 * Métricas de venda de ingressos para o financeiro. Vendas pagas contam pela data de
 * confirmação; cortesias ficam de fora.
 */

const CANAIS: Readonly<Record<string, string>> = { ONLINE: 'Site', POS: 'Balcão', ADMIN: 'Painel' };

export interface TicketSalesMetrics {
  tickets: Kpi;
  byChannel: { key: string; label: string; orders: number; tickets: number; amountCents: number }[];
  byTicketType: { key: string; name: string; tickets: number; amountCents: number }[];
  /** Vendas pagas para visitas de hoje em diante: dinheiro já recebido de visitas que ainda vão acontecer. */
  upcoming: { orders: number; tickets: number; amountCents: number; next7DaysCents: number };
}

function instantes(range: DateRange, fuso: string) {
  return {
    inicio: zonedTimeToInstant(range.from, '00:00', fuso),
    fim: zonedTimeToInstant(addDays(range.to, 1), '00:00', fuso),
  };
}

async function porCanal(db: DbClient, parkId: string, inicio: Date, fim: Date) {
  const linhas = await db.$queryRaw<
    { channel: string; orders: number; tickets: bigint | number; amount: bigint | number }[]
  >`
    SELECT o.channel::text AS channel, COUNT(*)::int AS orders,
      COALESCE(SUM(q.quantidade), 0)::bigint AS tickets,
      COALESCE(SUM(o.total_cents), 0)::bigint AS amount
    FROM orders o
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(i.quantity), 0) AS quantidade FROM order_items i WHERE i.order_id = o.id
    ) q
    WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY'
      AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
    GROUP BY 1
    ORDER BY amount DESC`;
  return linhas.map((linha) => ({
    key: linha.channel,
    label: CANAIS[linha.channel] ?? linha.channel,
    orders: linha.orders,
    tickets: rawNumber(linha.tickets),
    amountCents: rawNumber(linha.amount),
  }));
}

export async function getTicketSalesMetrics(
  auth: AuthContext,
  periodo: ParsedPeriod,
  db: DbClient = prisma,
): Promise<TicketSalesMetrics> {
  requirePermission(auth, 'finance.view');
  const parkId = auth.park.id;
  const fuso = auth.park.timezone;
  const atual = instantes(periodo.range, fuso);
  const antes = instantes(previousRange(periodo.range), fuso);
  const hoje = todayIn(fuso);
  const daquiASeteDias = addDays(hoje, 6);

  const [canais, canaisAntes, tipos, futuras] = await Promise.all([
    porCanal(db, parkId, atual.inicio, atual.fim),
    porCanal(db, parkId, antes.inicio, antes.fim),
    db.$queryRaw<{ id: string; name: string; tickets: bigint | number; amount: bigint | number }[]>`
      SELECT i.ticket_type_id::text AS id,
        (ARRAY_AGG(i.ticket_type_name ORDER BY o.confirmed_at DESC))[1] AS name,
        COALESCE(SUM(i.quantity), 0)::bigint AS tickets,
        COALESCE(SUM(i.total_cents), 0)::bigint AS amount
      FROM order_items i
      JOIN orders o ON o.id = i.order_id
      WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY'
        AND o.confirmed_at >= ${atual.inicio} AND o.confirmed_at < ${atual.fim}
      GROUP BY i.ticket_type_id
      ORDER BY amount DESC
      LIMIT 12`,
    db.$queryRaw<
      { orders: number; tickets: bigint | number; amount: bigint | number; next7: bigint | number }[]
    >`
      SELECT COUNT(*)::int AS orders,
        COALESCE(SUM(q.quantidade), 0)::bigint AS tickets,
        COALESCE(SUM(o.total_cents), 0)::bigint AS amount,
        COALESCE(SUM(o.total_cents) FILTER (WHERE o.visit_date <= ${daquiASeteDias}::date), 0)::bigint AS next7
      FROM orders o
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(i.quantity), 0) AS quantidade FROM order_items i WHERE i.order_id = o.id
      ) q
      WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY'
        AND o.financial_status IN ('PAID', 'PARTIALLY_REFUNDED')
        AND o.visit_date >= ${hoje}::date`,
  ]);

  const ingressos = canais.reduce((soma, canal) => soma + canal.tickets, 0);
  const ingressosAntes = canaisAntes.reduce((soma, canal) => soma + canal.tickets, 0);
  const futura = futuras[0];

  return {
    tickets: { value: ingressos, previous: ingressosAntes, change: percentChange(ingressos, ingressosAntes) },
    byChannel: canais,
    byTicketType: tipos.map((tipo) => ({
      key: tipo.id,
      name: tipo.name,
      tickets: rawNumber(tipo.tickets),
      amountCents: rawNumber(tipo.amount),
    })),
    upcoming: {
      orders: futura?.orders ?? 0,
      tickets: rawNumber(futura?.tickets),
      amountCents: rawNumber(futura?.amount),
      next7DaysCents: rawNumber(futura?.next7),
    },
  };
}
