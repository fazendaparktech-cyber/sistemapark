import 'server-only';

import { addDays, diffDays, todayIn, zonedTimeToInstant, type DateOnly } from '@/lib/dates';
import {
  paymentGroupOf,
  PAYMENT_GROUPS,
  saleStatusOf,
  type OrderChannelKey,
  type PaymentGroupKey,
  type PaymentMethodKey,
  type SaleStatusKey,
} from '@/lib/orders';
import { hostOf, ORIGINS, originOf, type OriginKey } from '@/lib/origins';
import { percentChange, previousRange, rangeLength, type DateRange, type ParsedPeriod } from '@/lib/periods';
import type { DayKind } from '@/lib/pricing';

import { can, requirePermission, type AuthContext } from '../auth/context';
import { getCalendarRange } from '../calendar/service';
import { prisma, type DbClient } from '../db';
import { env } from '../env';
import { rawNumber } from '../raw';

/**
 * Dashboard do parque.
 *
 * - Faturamento: dinheiro recebido (pagamentos aprovados, já sem reembolsos),
 *   no dia em que o pagamento entrou. Cortesia não conta.
 * - Vendas e ingressos vendidos: pedidos pagos, no dia da confirmação.
 * - Ticket médio: faturamento ÷ vendas. Valor médio por visitante: faturamento ÷ ingressos.
 * - Visitantes esperados: ingressos válidos para a data. Comparecimento:
 *   check-ins ÷ ingressos válidos das datas que já passaram. No-show: pagos que não entraram.
 * - Ocupação: vendidos ÷ capacidade. Capacidade disponível: capacidade − vendidos − reservados.
 *
 * Valores em dinheiro só para quem tem `dashboard.financial`.
 */

export interface Kpi {
  value: number;
  previous: number;
  /** Variação relativa (0,12 = +12%) ou, em taxas, diferença em pontos; `null` sem base. */
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

export interface VisitorsPoint {
  key: string;
  label: string;
  expected: number;
  checkins: number;
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

export interface TodaySummary {
  date: DateOnly;
  status: 'OPEN' | 'CLOSED' | null;
  opensAt: string | null;
  closesAt: string | null;
  label: string | null;
  /** Hoje comparado com ontem. */
  revenue: Kpi | null;
  /** Mês até hoje comparado com os mesmos dias do mês anterior. */
  monthRevenue: Kpi | null;
  ticketsSold: Kpi;
  expected: number;
  checkedIn: number;
  notArrived: number;
  capacity: number | null;
  sold: number;
  held: number;
  available: number | null;
  occupancy: number | null;
  attendance: number | null;
}

export interface DashboardData {
  period: ParsedPeriod & { previous: DateRange; granularity: SeriesGranularity };
  showFinancial: boolean;
  showMarketing: boolean;
  today: TodaySummary;
  kpis: {
    revenue: Kpi | null;
    orders: Kpi;
    tickets: Kpi;
    averageOrder: Kpi | null;
    averagePerVisitor: Kpi | null;
    onlineOrders: Kpi;
    posOrders: Kpi;
    onlineRevenue: Kpi | null;
    posRevenue: Kpi | null;
    discounts: Kpi | null;
    newCustomers: Kpi;
    returningCustomers: Kpi;
    /** Datas de visita já passadas do período; `null` quando o período ainda não tem dia encerrado. */
    attendance: Kpi | null;
    noShow: Kpi | null;
  };
  series: SeriesPoint[];
  visitors: VisitorsPoint[];
  byTicketType: { name: string; tickets: number; revenueCents: number }[];
  byChannel: { channel: 'ONLINE' | 'POS'; orders: number; tickets: number; revenueCents: number }[];
  byPaymentGroup: { group: PaymentGroupKey; payments: number; amountCents: number }[];
  byOrigin: { origin: OriginKey; orders: number; revenueCents: number }[] | null;
  pending: { orders: number; amountCents: number | null };
  refundsDue: { orders: number; amountCents: number | null };
  upcoming: UpcomingDay[];
  topCoupons: { code: string; uses: number; discountCents: number; revenueCents: number }[] | null;
  recentOrders:
    | {
        id: string;
        code: string;
        buyerName: string;
        saleStatus: SaleStatusKey;
        channel: OrderChannelKey;
        totalCents: number;
        ticketsCount: number;
        createdAt: Date;
      }[]
    | null;
}

// ─── Consultas ──────────────────────────────────────────────────────────────

interface Estatisticas {
  orders: number;
  onlineOrders: number;
  posOrders: number;
  tickets: number;
  onlineTickets: number;
  posTickets: number;
  revenue: number;
  onlineRevenue: number;
  posRevenue: number;
  discounts: number;
  newCustomers: number;
  returningCustomers: number;
}

async function estatisticas(db: DbClient, parkId: string, inicio: Date, fim: Date): Promise<Estatisticas> {
  const [linha] = await db.$queryRaw<
    {
      orders: number;
      online_orders: number;
      pos_orders: number;
      tickets: number;
      online_tickets: number;
      pos_tickets: number;
      revenue: bigint | number;
      online_revenue: bigint | number;
      pos_revenue: bigint | number;
      discounts: bigint | number;
      new_customers: number;
      returning_customers: number;
    }[]
  >`
    WITH confirmados AS (
      SELECT id, discount_cents, channel, customer_id
      FROM orders
      WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND channel <> 'COURTESY'
        AND confirmed_at >= ${inicio} AND confirmed_at < ${fim}
    ),
    vendidos AS (
      SELECT c.channel
      FROM tickets t
      JOIN confirmados c ON c.id = t.order_id
      WHERE t.status IN ('ACTIVE', 'CHECKED_IN')
    ),
    recebido AS (
      SELECT o.channel, SUM(p.amount_cents - p.refunded_cents) AS valor
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.park_id = ${parkId}::uuid
        AND p.status IN ('APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND p.method <> 'COURTESY'
        AND p.approved_at >= ${inicio} AND p.approved_at < ${fim}
      GROUP BY o.channel
    )
    SELECT
      (SELECT COUNT(*) FROM confirmados)::int AS orders,
      (SELECT COUNT(*) FROM confirmados WHERE channel = 'ONLINE')::int AS online_orders,
      (SELECT COUNT(*) FROM confirmados WHERE channel = 'POS')::int AS pos_orders,
      (SELECT COUNT(*) FROM vendidos)::int AS tickets,
      (SELECT COUNT(*) FROM vendidos WHERE channel = 'ONLINE')::int AS online_tickets,
      (SELECT COUNT(*) FROM vendidos WHERE channel = 'POS')::int AS pos_tickets,
      (SELECT COALESCE(SUM(valor), 0) FROM recebido)::bigint AS revenue,
      (SELECT COALESCE(SUM(valor), 0) FROM recebido WHERE channel = 'ONLINE')::bigint AS online_revenue,
      (SELECT COALESCE(SUM(valor), 0) FROM recebido WHERE channel = 'POS')::bigint AS pos_revenue,
      (SELECT COALESCE(SUM(discount_cents), 0) FROM confirmados)::bigint AS discounts,
      (SELECT COUNT(*) FROM (
        SELECT MIN(confirmed_at) AS primeira
        FROM orders
        WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND customer_id IS NOT NULL
        GROUP BY customer_id
      ) primeiras WHERE primeira >= ${inicio} AND primeira < ${fim})::int AS new_customers,
      (SELECT COUNT(DISTINCT c.customer_id) FROM confirmados c
        WHERE c.customer_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM orders anterior
          WHERE anterior.customer_id = c.customer_id AND anterior.status = 'CONFIRMED'
            AND anterior.confirmed_at < ${inicio}
        ))::int AS returning_customers`;

  return {
    orders: linha?.orders ?? 0,
    onlineOrders: linha?.online_orders ?? 0,
    posOrders: linha?.pos_orders ?? 0,
    tickets: linha?.tickets ?? 0,
    onlineTickets: linha?.online_tickets ?? 0,
    posTickets: linha?.pos_tickets ?? 0,
    revenue: rawNumber(linha?.revenue),
    onlineRevenue: rawNumber(linha?.online_revenue),
    posRevenue: rawNumber(linha?.pos_revenue),
    discounts: rawNumber(linha?.discounts),
    newCustomers: linha?.new_customers ?? 0,
    returningCustomers: linha?.returning_customers ?? 0,
  };
}

async function recebidoEntre(db: DbClient, parkId: string, inicio: Date, fim: Date): Promise<number> {
  const [linha] = await db.$queryRaw<{ valor: bigint | number }[]>`
    SELECT COALESCE(SUM(amount_cents - refunded_cents), 0)::bigint AS valor
    FROM payments
    WHERE park_id = ${parkId}::uuid AND status IN ('APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      AND method <> 'COURTESY' AND approved_at >= ${inicio} AND approved_at < ${fim}`;
  return rawNumber(linha?.valor);
}

async function ingressosVendidosEntre(
  db: DbClient,
  parkId: string,
  inicio: Date,
  fim: Date,
): Promise<number> {
  const [linha] = await db.$queryRaw<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY'
      AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
      AND t.status IN ('ACTIVE', 'CHECKED_IN')`;
  return linha?.total ?? 0;
}

/** Ingressos válidos e entradas registradas nas datas de visita do intervalo. */
async function comparecimento(
  db: DbClient,
  parkId: string,
  janela: DateRange | null,
): Promise<{ valid: number; checkedIn: number } | null> {
  if (!janela) return null;
  const [linha] = await db.$queryRaw<{ valid: number; checked_in: number }[]>`
    SELECT COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'CHECKED_IN'))::int AS valid,
      COUNT(*) FILTER (WHERE status = 'CHECKED_IN')::int AS checked_in
    FROM tickets
    WHERE park_id = ${parkId}::uuid AND visit_date BETWEEN ${janela.from}::date AND ${janela.to}::date`;
  return { valid: linha?.valid ?? 0, checkedIn: linha?.checked_in ?? 0 };
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

const FORMATOS: Record<SeriesGranularity, string> = {
  hour: 'YYYY-MM-DD HH24',
  day: 'YYYY-MM-DD',
  month: 'YYYY-MM',
};

async function serie(
  db: DbClient,
  parkId: string,
  fuso: string,
  periodo: DateRange,
  tipo: SeriesGranularity,
  inicio: Date,
  fim: Date,
): Promise<SeriesPoint[]> {
  const formato = FORMATOS[tipo];
  const [vendas, recebimentos] = await Promise.all([
    db.$queryRaw<{ key: string; orders: number; tickets: number }[]>`
      SELECT
        to_char(date_trunc(${tipo}::text, o.confirmed_at AT TIME ZONE ${fuso}::text), ${formato}::text) AS key,
        COUNT(*)::int AS orders,
        COALESCE(SUM(t.quantidade), 0)::int AS tickets
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS quantidade FROM tickets
        WHERE order_id = o.id AND status IN ('ACTIVE', 'CHECKED_IN')
      ) t ON true
      WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY'
        AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
      GROUP BY 1`,
    db.$queryRaw<{ key: string; revenue: bigint | number }[]>`
      SELECT
        to_char(date_trunc(${tipo}::text, approved_at AT TIME ZONE ${fuso}::text), ${formato}::text) AS key,
        COALESCE(SUM(amount_cents - refunded_cents), 0)::bigint AS revenue
      FROM payments
      WHERE park_id = ${parkId}::uuid AND status IN ('APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND method <> 'COURTESY' AND approved_at >= ${inicio} AND approved_at < ${fim}
      GROUP BY 1`,
  ]);
  const vendasPorChave = new Map(vendas.map((linha) => [linha.key, linha]));
  const receitaPorChave = new Map(recebimentos.map((linha) => [linha.key, rawNumber(linha.revenue)]));
  return baldes(periodo, tipo).map(({ key, label }) => ({
    key,
    label,
    revenueCents: receitaPorChave.get(key) ?? 0,
    orders: vendasPorChave.get(key)?.orders ?? 0,
    tickets: vendasPorChave.get(key)?.tickets ?? 0,
  }));
}

async function visitantesPorDia(
  db: DbClient,
  parkId: string,
  periodo: DateRange,
  tipo: 'day' | 'month',
): Promise<VisitorsPoint[]> {
  const linhas = await db.$queryRaw<{ key: string; expected: number; checkins: number }[]>`
    SELECT
      to_char(date_trunc(${tipo}::text, visit_date::timestamp), ${FORMATOS[tipo]}::text) AS key,
      COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'CHECKED_IN'))::int AS expected,
      COUNT(*) FILTER (WHERE status = 'CHECKED_IN')::int AS checkins
    FROM tickets
    WHERE park_id = ${parkId}::uuid AND visit_date BETWEEN ${periodo.from}::date AND ${periodo.to}::date
    GROUP BY 1`;
  const porChave = new Map(linhas.map((linha) => [linha.key, linha]));
  return baldes(periodo, tipo).map(({ key, label }) => ({
    key,
    label,
    expected: porChave.get(key)?.expected ?? 0,
    checkins: porChave.get(key)?.checkins ?? 0,
  }));
}

function menorData(a: DateOnly, b: DateOnly): DateOnly {
  return a <= b ? a : b;
}

/** Parte do intervalo que já terminou (até ontem); `null` se nenhum dia terminou. */
function diasEncerrados(periodo: DateRange, hoje: DateOnly): DateRange | null {
  const ate = menorData(periodo.to, addDays(hoje, -1));
  return periodo.from <= ate ? { from: periodo.from, to: ate } : null;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

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
  const instante = (data: DateOnly) => zonedTimeToInstant(data, '00:00', fuso);

  const intervalo = periodo.range;
  const anterior = previousRange(intervalo);
  const tipo = granularidade(intervalo);
  const inicio = instante(intervalo.from);
  const fim = instante(addDays(intervalo.to, 1));
  const inicioAnterior = instante(anterior.from);

  const hoje = todayIn(fuso);
  const ontem = addDays(hoje, -1);
  const inicioDoMes = `${hoje.slice(0, 7)}-01`;
  const fimDoMesAnterior = addDays(inicioDoMes, -1);
  const inicioDoMesAnterior = `${fimDoMesAnterior.slice(0, 7)}-01`;
  const mesmoDiaDoMesAnterior = menorData(
    addDays(inicioDoMesAnterior, diffDays(inicioDoMes, hoje)),
    fimDoMesAnterior,
  );
  const encerrados = diasEncerrados(intervalo, hoje);
  const encerradosAntes = diasEncerrados(anterior, hoje);

  const [
    atual,
    passado,
    pontos,
    visitantes,
    porTipo,
    porMetodo,
    origens,
    proximos,
    entradasHoje,
    receitaHoje,
    receitaOntem,
    receitaDoMes,
    receitaDoMesAnterior,
    vendidosHoje,
    vendidosOntem,
    presenca,
    presencaAntes,
    pendentes,
    aDevolver,
    cupons,
    recentes,
  ] = await Promise.all([
    estatisticas(db, parkId, inicio, fim),
    estatisticas(db, parkId, inicioAnterior, inicio),
    serie(db, parkId, fuso, intervalo, tipo, inicio, fim),
    visitantesPorDia(db, parkId, intervalo, tipo === 'month' ? 'month' : 'day'),
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
      ORDER BY tickets DESC, revenue DESC`,
    db.$queryRaw<{ method: PaymentMethodKey; payments: number; amount: bigint | number }[]>`
      SELECT method::text AS method, COUNT(*)::int AS payments,
        COALESCE(SUM(amount_cents - refunded_cents), 0)::bigint AS amount
      FROM payments
      WHERE park_id = ${parkId}::uuid AND status IN ('APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND method <> 'COURTESY' AND approved_at >= ${inicio} AND approved_at < ${fim}
      GROUP BY method`,
    marketing
      ? db.$queryRaw<
          { source: string | null; host: string | null; orders: number; revenue: bigint | number }[]
        >`
          SELECT lower(NULLIF(btrim(utm_source), '')) AS source,
            lower(substring(referrer from '^[a-zA-Z]+://([^/:?#]+)')) AS host,
            COUNT(*)::int AS orders,
            COALESCE(SUM(total_cents), 0)::bigint AS revenue
          FROM orders
          WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND channel = 'ONLINE'
            AND confirmed_at >= ${inicio} AND confirmed_at < ${fim}
          GROUP BY 1, 2`
      : Promise.resolve(null),
    getCalendarRange(parkId, hoje, addDays(hoje, 13), db),
    db.$queryRaw<{ expected: number; checked_in: number }[]>`
      SELECT COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'CHECKED_IN'))::int AS expected,
        COUNT(*) FILTER (WHERE status = 'CHECKED_IN')::int AS checked_in
      FROM tickets
      WHERE park_id = ${parkId}::uuid AND visit_date = ${hoje}::date`,
    recebidoEntre(db, parkId, instante(hoje), instante(addDays(hoje, 1))),
    recebidoEntre(db, parkId, instante(ontem), instante(hoje)),
    recebidoEntre(db, parkId, instante(inicioDoMes), instante(addDays(hoje, 1))),
    recebidoEntre(db, parkId, instante(inicioDoMesAnterior), instante(addDays(mesmoDiaDoMesAnterior, 1))),
    ingressosVendidosEntre(db, parkId, instante(hoje), instante(addDays(hoje, 1))),
    ingressosVendidosEntre(db, parkId, instante(ontem), instante(hoje)),
    comparecimento(db, parkId, encerrados),
    comparecimento(db, parkId, encerradosAntes),
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
            financialStatus: true,
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
  const kpiDeDinheiro = (a: number, b: number): Kpi | null => (financeiro ? kpi(a, b) : null);
  const media = (valor: number, divisor: number): number => (divisor > 0 ? Math.round(valor / divisor) : 0);
  const agora = new Date();

  const diaDeHoje = proximos[0];
  const esperados = entradasHoje[0]?.expected ?? 0;
  const entraram = entradasHoje[0]?.checked_in ?? 0;
  const capacidadeHoje = diaDeHoje?.status === 'OPEN' ? diaDeHoje.capacity : null;

  const taxaDePresenca = presenca && presenca.valid > 0 ? presenca.checkedIn / presenca.valid : null;
  const taxaDePresencaAntes =
    presencaAntes && presencaAntes.valid > 0 ? presencaAntes.checkedIn / presencaAntes.valid : null;

  const porGrupo = new Map<PaymentGroupKey, { payments: number; amountCents: number }>();
  for (const linha of porMetodo) {
    const grupo = paymentGroupOf(linha.method);
    const acumulado = porGrupo.get(grupo) ?? { payments: 0, amountCents: 0 };
    porGrupo.set(grupo, {
      payments: acumulado.payments + linha.payments,
      amountCents: acumulado.amountCents + rawNumber(linha.amount),
    });
  }

  let porOrigem: DashboardData['byOrigin'] = null;
  if (origens) {
    const dominioProprio = hostOf(env().APP_URL);
    const soma = new Map<OriginKey, { orders: number; revenueCents: number }>();
    for (const linha of origens) {
      const origem = originOf({ utmSource: linha.source, referrerHost: linha.host, ownHost: dominioProprio });
      const acumulado = soma.get(origem) ?? { orders: 0, revenueCents: 0 };
      soma.set(origem, {
        orders: acumulado.orders + linha.orders,
        revenueCents: acumulado.revenueCents + (financeiro ? rawNumber(linha.revenue) : 0),
      });
    }
    porOrigem = ORIGINS.flatMap((origem) => {
      const valores = soma.get(origem);
      return valores ? [{ origin: origem, ...valores }] : [];
    }).sort((a, b) => b.orders - a.orders);
  }

  return {
    period: { ...periodo, previous: anterior, granularity: tipo },
    showFinancial: financeiro,
    showMarketing: marketing,
    today: {
      date: hoje,
      status: diaDeHoje?.status ?? null,
      opensAt: diaDeHoje?.opensAt ?? null,
      closesAt: diaDeHoje?.closesAt ?? null,
      label: diaDeHoje?.label ?? null,
      revenue: kpiDeDinheiro(receitaHoje, receitaOntem),
      monthRevenue: kpiDeDinheiro(receitaDoMes, receitaDoMesAnterior),
      ticketsSold: kpi(vendidosHoje, vendidosOntem),
      expected: esperados,
      checkedIn: entraram,
      notArrived: Math.max(0, esperados - entraram),
      capacity: capacidadeHoje,
      sold: diaDeHoje?.sold ?? 0,
      held: diaDeHoje?.held ?? 0,
      available: diaDeHoje?.status === 'OPEN' ? (diaDeHoje.available ?? 0) : null,
      occupancy: capacidadeHoje ? (diaDeHoje?.sold ?? 0) / capacidadeHoje : null,
      attendance: esperados > 0 ? entraram / esperados : null,
    },
    kpis: {
      revenue: kpiDeDinheiro(atual.revenue, passado.revenue),
      orders: kpi(atual.orders, passado.orders),
      tickets: kpi(atual.tickets, passado.tickets),
      averageOrder: kpiDeDinheiro(media(atual.revenue, atual.orders), media(passado.revenue, passado.orders)),
      averagePerVisitor: kpiDeDinheiro(
        media(atual.revenue, atual.tickets),
        media(passado.revenue, passado.tickets),
      ),
      onlineOrders: kpi(atual.onlineOrders, passado.onlineOrders),
      posOrders: kpi(atual.posOrders, passado.posOrders),
      onlineRevenue: kpiDeDinheiro(atual.onlineRevenue, passado.onlineRevenue),
      posRevenue: kpiDeDinheiro(atual.posRevenue, passado.posRevenue),
      discounts: kpiDeDinheiro(atual.discounts, passado.discounts),
      newCustomers: kpi(atual.newCustomers, passado.newCustomers),
      returningCustomers: kpi(atual.returningCustomers, passado.returningCustomers),
      attendance:
        taxaDePresenca === null
          ? null
          : {
              value: taxaDePresenca,
              previous: taxaDePresencaAntes ?? 0,
              change: taxaDePresencaAntes === null ? null : taxaDePresenca - taxaDePresencaAntes,
            },
      noShow:
        presenca === null
          ? null
          : kpi(
              presenca.valid - presenca.checkedIn,
              presencaAntes ? presencaAntes.valid - presencaAntes.checkedIn : 0,
            ),
    },
    series: pontos.map((ponto) => ({ ...ponto, revenueCents: financeiro ? ponto.revenueCents : 0 })),
    visitors: visitantes,
    byTicketType: porTipo.map((linha) => ({
      name: linha.name,
      tickets: linha.tickets,
      revenueCents: financeiro ? rawNumber(linha.revenue) : 0,
    })),
    byChannel: [
      {
        channel: 'ONLINE',
        orders: atual.onlineOrders,
        tickets: atual.onlineTickets,
        revenueCents: financeiro ? atual.onlineRevenue : 0,
      },
      {
        channel: 'POS',
        orders: atual.posOrders,
        tickets: atual.posTickets,
        revenueCents: financeiro ? atual.posRevenue : 0,
      },
    ],
    byPaymentGroup: financeiro
      ? PAYMENT_GROUPS.flatMap((grupo) => {
          const valores = porGrupo.get(grupo);
          return valores ? [{ group: grupo, ...valores }] : [];
        }).sort((a, b) => b.amountCents - a.amountCents)
      : [],
    byOrigin: porOrigem,
    pending: { orders: pendentes[0]?.orders ?? 0, amountCents: dinheiro(rawNumber(pendentes[0]?.amount)) },
    refundsDue: { orders: aDevolver[0]?.orders ?? 0, amountCents: dinheiro(rawNumber(aDevolver[0]?.amount)) },
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
    recentOrders: recentes
      ? recentes.map((pedido) => ({
          id: pedido.id,
          code: pedido.code,
          buyerName: pedido.buyerName,
          saleStatus: saleStatusOf(pedido, agora),
          channel: pedido.channel,
          totalCents: pedido.totalCents,
          ticketsCount: pedido._count.tickets,
          createdAt: pedido.createdAt,
        }))
      : null,
  };
}
