import 'server-only';

import { addDays, todayIn, zonedTimeToInstant, type DateOnly } from '@/lib/dates';
import {
  effectiveOrderStatus,
  type OrderChannelKey,
  type OrderStatusKey,
  type PaymentMethodKey,
} from '@/lib/orders';
import { percentChange, previousRange, rangeLength, type DateRange, type ParsedPeriod } from '@/lib/periods';
import type { DayKind } from '@/lib/pricing';

import { can, requirePermission, type AuthContext } from '../auth/context';
import { getCalendarRange } from '../calendar/service';
import { prisma, type DbClient } from '../db';
import { rawNumber } from '../raw';

/**
 * Painel de vendas. Venda conta no dia em que foi confirmada (pagamento
 * aprovado), no fuso do parque; cortesias não entram em receita nem em
 * ingressos vendidos. Valores em dinheiro só para quem tem
 * `dashboard.financial`.
 */

export interface Kpi {
  value: number;
  previous: number;
  /** Variação relativa (0,12 = +12%); `null` sem base de comparação. */
  change: number | null;
}

export type SeriesGranularity = 'hour' | 'day' | 'month';

export interface SeriesPoint {
  key: string;
  label: string;
  revenueCents: number;
  orders: number;
  tickets: number;
}

export interface UpcomingDay {
  date: DateOnly;
  status: 'OPEN' | 'CLOSED' | null;
  dayKind: DayKind;
  label: string | null;
  capacity: number | null;
  sold: number;
  held: number;
  available: number | null;
}

export interface DashboardData {
  period: ParsedPeriod & { previous: DateRange; granularity: SeriesGranularity };
  showFinancial: boolean;
  showMarketing: boolean;
  kpis: {
    revenue: Kpi | null;
    orders: Kpi;
    tickets: Kpi;
    averageOrder: Kpi | null;
    discounts: Kpi | null;
    newCustomers: Kpi;
    /** Pedidos do site confirmados ÷ pedidos do site criados (0 a 1). */
    conversion: Kpi;
    checkins: Kpi;
  };
  pending: { orders: number; amountCents: number | null };
  refundsDue: { orders: number; amountCents: number | null };
  today: {
    date: DateOnly;
    status: 'OPEN' | 'CLOSED' | null;
    opensAt: string | null;
    closesAt: string | null;
    capacity: number | null;
    expected: number;
    checkedIn: number;
    held: number;
    available: number | null;
  };
  series: SeriesPoint[];
  byTicketType: { name: string; tickets: number; revenueCents: number }[];
  byChannel: { channel: OrderChannelKey; orders: number; revenueCents: number }[];
  byPaymentMethod: { method: PaymentMethodKey; payments: number; amountCents: number }[];
  byHour: { hour: number; orders: number }[];
  byWeekday: { weekday: number; tickets: number }[];
  upcoming: UpcomingDay[];
  topCoupons: { code: string; uses: number; discountCents: number; revenueCents: number }[] | null;
  topSources: { source: string; orders: number; revenueCents: number }[] | null;
  recentOrders:
    | {
        id: string;
        code: string;
        buyerName: string;
        status: OrderStatusKey;
        channel: OrderChannelKey;
        totalCents: number;
        ticketsCount: number;
        createdAt: Date;
      }[]
    | null;
}

interface Estatisticas {
  orders: number;
  revenue: number;
  discounts: number;
  tickets: number;
  newCustomers: number;
  created: number;
  converted: number;
  checkins: number;
}

async function estatisticas(db: DbClient, parkId: string, inicio: Date, fim: Date): Promise<Estatisticas> {
  const [linha] = await db.$queryRaw<
    {
      orders: number;
      revenue: bigint | number;
      discounts: bigint | number;
      tickets: number;
      new_customers: number;
      created: number;
      converted: number;
      checkins: number;
    }[]
  >`
    WITH confirmados AS (
      SELECT id, total_cents, discount_cents
      FROM orders
      WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND channel <> 'COURTESY'
        AND confirmed_at >= ${inicio} AND confirmed_at < ${fim}
    )
    SELECT
      (SELECT COUNT(*) FROM confirmados)::int AS orders,
      (SELECT COALESCE(SUM(total_cents), 0) FROM confirmados)::bigint AS revenue,
      (SELECT COALESCE(SUM(discount_cents), 0) FROM confirmados)::bigint AS discounts,
      (SELECT COUNT(*) FROM tickets t JOIN confirmados c ON c.id = t.order_id
        WHERE t.status IN ('ACTIVE', 'CHECKED_IN'))::int AS tickets,
      (SELECT COUNT(*) FROM (
        SELECT MIN(confirmed_at) AS primeira
        FROM orders
        WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND customer_id IS NOT NULL
        GROUP BY customer_id
      ) primeiras WHERE primeira >= ${inicio} AND primeira < ${fim})::int AS new_customers,
      (SELECT COUNT(*) FROM orders
        WHERE park_id = ${parkId}::uuid AND channel = 'ONLINE'
          AND created_at >= ${inicio} AND created_at < ${fim})::int AS created,
      (SELECT COUNT(*) FROM orders
        WHERE park_id = ${parkId}::uuid AND channel = 'ONLINE' AND confirmed_at IS NOT NULL
          AND created_at >= ${inicio} AND created_at < ${fim})::int AS converted,
      (SELECT COUNT(*) FROM tickets
        WHERE park_id = ${parkId}::uuid AND checked_in_at >= ${inicio} AND checked_in_at < ${fim})::int AS checkins`;

  return {
    orders: linha?.orders ?? 0,
    revenue: rawNumber(linha?.revenue),
    discounts: rawNumber(linha?.discounts),
    tickets: linha?.tickets ?? 0,
    newCustomers: linha?.new_customers ?? 0,
    created: linha?.created ?? 0,
    converted: linha?.converted ?? 0,
    checkins: linha?.checkins ?? 0,
  };
}

function kpi(atual: number, anterior: number): Kpi {
  return { value: atual, previous: anterior, change: percentChange(atual, anterior) };
}

function granularidade(periodo: DateRange): SeriesGranularity {
  const dias = rangeLength(periodo);
  if (dias <= 2) return 'hour';
  if (dias <= 92) return 'day';
  return 'month';
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function doisDigitos(n: number): string {
  return n.toString().padStart(2, '0');
}

function baldes(periodo: DateRange, tipo: SeriesGranularity): { key: string; label: string }[] {
  const dias = rangeLength(periodo);
  if (tipo === 'hour') {
    const lista: { key: string; label: string }[] = [];
    for (let d = 0; d < dias; d++) {
      const data = addDays(periodo.from, d);
      for (let h = 0; h < 24; h++) {
        const hora = doisDigitos(h);
        lista.push({
          key: `${data} ${hora}`,
          label: dias > 1 ? `${data.slice(8, 10)}/${data.slice(5, 7)} ${hora}h` : `${hora}h`,
        });
      }
    }
    return lista;
  }
  if (tipo === 'day') {
    return Array.from({ length: dias }, (_, i) => {
      const data = addDays(periodo.from, i);
      return { key: data, label: `${data.slice(8, 10)}/${data.slice(5, 7)}` };
    });
  }
  const lista: { key: string; label: string }[] = [];
  let ano = Number(periodo.from.slice(0, 4));
  let mes = Number(periodo.from.slice(5, 7));
  const anoFinal = Number(periodo.to.slice(0, 4));
  const mesFinal = Number(periodo.to.slice(5, 7));
  while (ano < anoFinal || (ano === anoFinal && mes <= mesFinal)) {
    lista.push({
      key: `${ano}-${doisDigitos(mes)}`,
      label: `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}`,
    });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return lista;
}

async function serie(
  db: DbClient,
  parkId: string,
  fuso: string,
  periodo: DateRange,
  tipo: SeriesGranularity,
  inicio: Date,
  fim: Date,
): Promise<SeriesPoint[]> {
  const formato = tipo === 'hour' ? 'YYYY-MM-DD HH24' : tipo === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
  const linhas = await db.$queryRaw<
    { key: string; orders: number; revenue: bigint | number; tickets: number }[]
  >`
    SELECT
      to_char(date_trunc(${tipo}::text, o.confirmed_at AT TIME ZONE ${fuso}::text), ${formato}::text) AS key,
      COUNT(*)::int AS orders,
      COALESCE(SUM(o.total_cents), 0)::bigint AS revenue,
      COALESCE(SUM(t.quantidade), 0)::int AS tickets
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS quantidade FROM tickets
      WHERE order_id = o.id AND status IN ('ACTIVE', 'CHECKED_IN')
    ) t ON true
    WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY'
      AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
    GROUP BY 1`;
  const porChave = new Map(linhas.map((linha) => [linha.key, linha]));
  return baldes(periodo, tipo).map(({ key, label }) => {
    const linha = porChave.get(key);
    return {
      key,
      label,
      revenueCents: rawNumber(linha?.revenue),
      orders: linha?.orders ?? 0,
      tickets: linha?.tickets ?? 0,
    };
  });
}

export async function getDashboard(
  auth: AuthContext,
  periodo: ParsedPeriod,
  db: DbClient = prisma,
): Promise<DashboardData> {
  requirePermission(auth, 'dashboard.view');
  const parkId = auth.park.id;
  const fuso = auth.park.timezone;
  const financeiro = can(auth, 'dashboard.financial');
  const marketing = financeiro || can(auth, 'marketing.view');
  const verPedidos = can(auth, 'orders.view');

  const intervalo = periodo.range;
  const anterior = previousRange(intervalo);
  const tipo = granularidade(intervalo);
  const inicio = zonedTimeToInstant(intervalo.from, '00:00', fuso);
  const fim = zonedTimeToInstant(addDays(intervalo.to, 1), '00:00', fuso);
  const inicioAnterior = zonedTimeToInstant(anterior.from, '00:00', fuso);
  const hoje = todayIn(fuso);

  const [
    atual,
    passado,
    pontos,
    porTipo,
    porCanal,
    porMetodo,
    porHora,
    porDiaDaSemana,
    proximos,
    entradasHoje,
    pendentes,
    aDevolver,
    cupons,
    origens,
    recentes,
  ] = await Promise.all([
    estatisticas(db, parkId, inicio, fim),
    estatisticas(db, parkId, inicioAnterior, inicio),
    serie(db, parkId, fuso, intervalo, tipo, inicio, fim),
    db.$queryRaw<{ name: string; tickets: number; revenue: bigint | number }[]>`
      SELECT tt.name,
        COALESCE(SUM(oi.quantity * tt.people_per_ticket), 0)::int AS tickets,
        COALESCE(SUM(oi.total_cents), 0)::bigint AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY'
        AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
      GROUP BY tt.id, tt.name
      ORDER BY revenue DESC, tickets DESC`,
    db.$queryRaw<{ channel: OrderChannelKey; orders: number; revenue: bigint | number }[]>`
      SELECT channel::text AS channel, COUNT(*)::int AS orders, COALESCE(SUM(total_cents), 0)::bigint AS revenue
      FROM orders
      WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED'
        AND confirmed_at >= ${inicio} AND confirmed_at < ${fim}
      GROUP BY channel
      ORDER BY orders DESC`,
    db.$queryRaw<{ method: PaymentMethodKey; payments: number; amount: bigint | number }[]>`
      SELECT method::text AS method, COUNT(*)::int AS payments,
        COALESCE(SUM(amount_cents - refunded_cents), 0)::bigint AS amount
      FROM payments
      WHERE park_id = ${parkId}::uuid AND status IN ('APPROVED', 'PARTIALLY_REFUNDED')
        AND approved_at >= ${inicio} AND approved_at < ${fim}
      GROUP BY method
      ORDER BY amount DESC`,
    db.$queryRaw<{ hour: number; orders: number }[]>`
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE ${fuso}::text)::int AS hour, COUNT(*)::int AS orders
      FROM orders
      WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND channel <> 'COURTESY'
        AND confirmed_at >= ${inicio} AND confirmed_at < ${fim}
      GROUP BY 1`,
    db.$queryRaw<{ weekday: number; tickets: number }[]>`
      SELECT EXTRACT(DOW FROM t.visit_date)::int AS weekday, COUNT(*)::int AS tickets
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY'
        AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
        AND t.status IN ('ACTIVE', 'CHECKED_IN')
      GROUP BY 1`,
    getCalendarRange(parkId, hoje, addDays(hoje, 13), db),
    db.$queryRaw<{ expected: number; checked_in: number }[]>`
      SELECT COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'CHECKED_IN'))::int AS expected,
        COUNT(*) FILTER (WHERE status = 'CHECKED_IN')::int AS checked_in
      FROM tickets
      WHERE park_id = ${parkId}::uuid AND visit_date = ${hoje}::date`,
    db.$queryRaw<{ orders: number; amount: bigint | number }[]>`
      SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_cents), 0)::bigint AS amount
      FROM orders
      WHERE park_id = ${parkId}::uuid AND status = 'PENDING_PAYMENT' AND expires_at > now()`,
    db.$queryRaw<{ orders: number; amount: bigint | number }[]>`
      SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_cents), 0)::bigint AS amount
      FROM orders
      WHERE park_id = ${parkId}::uuid AND financial_status = 'PAID' AND status IN ('EXPIRED', 'CANCELLED')`,
    marketing
      ? db.$queryRaw<{ code: string; uses: number; discount: bigint | number; revenue: bigint | number }[]>`
          SELECT c.code, COUNT(*)::int AS uses,
            COALESCE(SUM(u.discount_cents), 0)::bigint AS discount,
            COALESCE(SUM(o.total_cents), 0)::bigint AS revenue
          FROM coupon_usages u
          JOIN coupons c ON c.id = u.coupon_id
          JOIN orders o ON o.id = u.order_id
          WHERE c.park_id = ${parkId}::uuid AND u.status = 'CONFIRMED'
            AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
          GROUP BY c.id, c.code
          ORDER BY uses DESC, revenue DESC
          LIMIT 5`
      : Promise.resolve(null),
    marketing
      ? db.$queryRaw<{ source: string; orders: number; revenue: bigint | number }[]>`
          SELECT COALESCE(NULLIF(TRIM(utm_source), ''), 'Direto') AS source,
            COUNT(*)::int AS orders, COALESCE(SUM(total_cents), 0)::bigint AS revenue
          FROM orders
          WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND channel = 'ONLINE'
            AND confirmed_at >= ${inicio} AND confirmed_at < ${fim}
          GROUP BY 1
          ORDER BY orders DESC
          LIMIT 6`
      : Promise.resolve(null),
    verPedidos
      ? db.order.findMany({
          where: { parkId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 8,
          select: {
            id: true,
            code: true,
            buyerName: true,
            status: true,
            expiresAt: true,
            channel: true,
            totalCents: true,
            createdAt: true,
            _count: { select: { tickets: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const dinheiro = (valor: number): number | null => (financeiro ? valor : null);
  const kpiDeDinheiro = (atualValor: number, anteriorValor: number): Kpi | null =>
    financeiro ? kpi(atualValor, anteriorValor) : null;
  const ticketMedio = (e: Estatisticas): number => (e.orders > 0 ? Math.round(e.revenue / e.orders) : 0);
  const conversao = (e: Estatisticas): number => (e.created > 0 ? e.converted / e.created : 0);
  const diaDeHoje = proximos[0];
  const horas = new Map(porHora.map((linha) => [linha.hour, linha.orders]));
  const diasDaSemana = new Map(porDiaDaSemana.map((linha) => [linha.weekday, linha.tickets]));
  const agora = new Date();

  return {
    period: { ...periodo, previous: anterior, granularity: tipo },
    showFinancial: financeiro,
    showMarketing: marketing,
    kpis: {
      revenue: kpiDeDinheiro(atual.revenue, passado.revenue),
      orders: kpi(atual.orders, passado.orders),
      tickets: kpi(atual.tickets, passado.tickets),
      averageOrder: kpiDeDinheiro(ticketMedio(atual), ticketMedio(passado)),
      discounts: kpiDeDinheiro(atual.discounts, passado.discounts),
      newCustomers: kpi(atual.newCustomers, passado.newCustomers),
      conversion: {
        value: conversao(atual),
        previous: conversao(passado),
        change: passado.created > 0 && atual.created > 0 ? conversao(atual) - conversao(passado) : null,
      },
      checkins: kpi(atual.checkins, passado.checkins),
    },
    pending: { orders: pendentes[0]?.orders ?? 0, amountCents: dinheiro(rawNumber(pendentes[0]?.amount)) },
    refundsDue: { orders: aDevolver[0]?.orders ?? 0, amountCents: dinheiro(rawNumber(aDevolver[0]?.amount)) },
    today: {
      date: hoje,
      status: diaDeHoje?.status ?? null,
      opensAt: diaDeHoje?.opensAt ?? null,
      closesAt: diaDeHoje?.closesAt ?? null,
      capacity: diaDeHoje?.capacity ?? null,
      expected: entradasHoje[0]?.expected ?? 0,
      checkedIn: entradasHoje[0]?.checked_in ?? 0,
      held: diaDeHoje?.held ?? 0,
      available: diaDeHoje?.available ?? null,
    },
    series: pontos.map((ponto) => ({ ...ponto, revenueCents: financeiro ? ponto.revenueCents : 0 })),
    byTicketType: porTipo.map((linha) => ({
      name: linha.name,
      tickets: linha.tickets,
      revenueCents: financeiro ? rawNumber(linha.revenue) : 0,
    })),
    byChannel: porCanal.map((linha) => ({
      channel: linha.channel,
      orders: linha.orders,
      revenueCents: financeiro ? rawNumber(linha.revenue) : 0,
    })),
    byPaymentMethod: financeiro
      ? porMetodo.map((linha) => ({
          method: linha.method,
          payments: linha.payments,
          amountCents: rawNumber(linha.amount),
        }))
      : [],
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: horas.get(hour) ?? 0 })),
    byWeekday: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      tickets: diasDaSemana.get(weekday) ?? 0,
    })),
    upcoming: proximos.map((dia) => ({
      date: dia.date,
      status: dia.status,
      dayKind: dia.dayKind,
      label: dia.label,
      capacity: dia.capacity,
      sold: dia.sold,
      held: dia.held,
      available: dia.available,
    })),
    topCoupons: cupons
      ? cupons.map((linha) => ({
          code: linha.code,
          uses: linha.uses,
          discountCents: financeiro ? rawNumber(linha.discount) : 0,
          revenueCents: financeiro ? rawNumber(linha.revenue) : 0,
        }))
      : null,
    topSources: origens
      ? origens.map((linha) => ({
          source: linha.source,
          orders: linha.orders,
          revenueCents: financeiro ? rawNumber(linha.revenue) : 0,
        }))
      : null,
    recentOrders: recentes
      ? recentes.map((pedido) => ({
          id: pedido.id,
          code: pedido.code,
          buyerName: pedido.buyerName,
          status: effectiveOrderStatus(pedido, agora),
          channel: pedido.channel,
          totalCents: pedido.totalCents,
          ticketsCount: pedido._count.tickets,
          createdAt: pedido.createdAt,
        }))
      : null,
  };
}
