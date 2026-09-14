import 'server-only';

import { addDays, zonedTimeToInstant, type DateOnly } from '@/lib/dates';
import { publicTrackingEventSchema, type TrackingEventTypeKey } from '@/lib/marketing';
import { hostOf, ORIGINS, originOf, type OriginKey } from '@/lib/origins';
import { percentChange, previousRange, type DateRange, type ParsedPeriod } from '@/lib/periods';

import { can, requirePermission, type AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { env } from '../env';
import { fromZodError } from '../errors';
import { enforceRateLimit, rateLimitKey } from '../rate-limit';
import { rawNumber } from '../raw';
import type { RequestMeta } from '../request';

/**
 * Funil de compra do site e origem das vendas.
 *
 * - Visualização dos ingressos e início do checkout: enviados pelo navegador,
 *   um por navegador a cada janela de tempo.
 * - Pagamento iniciado e compra realizada: gravados pelo servidor a partir do
 *   pedido (um de cada por pedido), com a origem registrada no pedido.
 */

// ─── Registro ───────────────────────────────────────────────────────────────

/** Minutos em que o mesmo navegador não conta de novo o mesmo passo. */
const JANELA_SEM_REPETIR = { VIEW_TICKETS: 30, CHECKOUT_STARTED: 10 } as const;

export async function recordPublicTrackingEvent(
  parkId: string,
  input: unknown,
  meta: RequestMeta,
  db: DbClient = prisma,
  agora: Date = new Date(),
): Promise<{ recorded: boolean }> {
  const resultado = publicTrackingEventSchema.safeParse(input);
  if (!resultado.success) throw fromZodError(resultado.error);
  const dados = resultado.data;
  await enforceRateLimit({ key: rateLimitKey('rastreio', meta.ip), limit: 120, windowSeconds: 600 }, db);

  const recente = await db.trackingEvent.findFirst({
    where: {
      parkId,
      type: dados.type,
      visitorId: dados.visitorId,
      createdAt: { gt: new Date(agora.getTime() - JANELA_SEM_REPETIR[dados.type] * 60_000) },
    },
    select: { id: true },
  });
  if (recente) return { recorded: false };

  const origem = dados.attribution ?? {};
  await db.trackingEvent.create({
    data: {
      parkId,
      type: dados.type,
      visitorId: dados.visitorId,
      valueCents: dados.valueCents ?? null,
      utmSource: origem.utmSource ?? null,
      utmMedium: origem.utmMedium ?? null,
      utmCampaign: origem.utmCampaign ?? null,
      utmContent: origem.utmContent ?? null,
      referrer: origem.referrer ?? null,
    },
  });
  return { recorded: true };
}

/** Pagamento iniciado ou compra realizada de um pedido do site. Repetir não duplica. */
export async function recordOrderTrackingEvent(
  db: DbClient,
  pedido: {
    id: string;
    parkId: string;
    totalCents: number;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    referrer: string | null;
  },
  type: Extract<TrackingEventTypeKey, 'PAYMENT_STARTED' | 'PURCHASE'>,
  visitorId: string | null = null,
): Promise<void> {
  const anteriores = await db.trackingEvent.findMany({
    where: { orderId: pedido.id },
    select: { type: true, visitorId: true },
  });
  if (anteriores.some((evento) => evento.type === type)) return;
  await db.trackingEvent.create({
    data: {
      parkId: pedido.parkId,
      type,
      orderId: pedido.id,
      visitorId: visitorId ?? anteriores.find((evento) => evento.visitorId)?.visitorId ?? null,
      valueCents: pedido.totalCents,
      utmSource: pedido.utmSource,
      utmMedium: pedido.utmMedium,
      utmCampaign: pedido.utmCampaign,
      utmContent: pedido.utmContent,
      referrer: pedido.referrer,
    },
  });
}

// ─── Painel ─────────────────────────────────────────────────────────────────

export interface FunnelCounts {
  views: number;
  checkouts: number;
  payments: number;
  purchases: number;
  purchaseValueCents: number;
}

export interface FunnelByOrigin extends FunnelCounts {
  origin: OriginKey;
  /** Compras ÷ visualizações. */
  conversion: number | null;
}

export interface CampaignRow extends FunnelCounts {
  campaign: string;
  source: string | null;
  medium: string | null;
  conversion: number | null;
}

export interface MarketingOverview {
  period: ParsedPeriod & { previous: DateRange };
  showValues: boolean;
  funnel: FunnelCounts;
  previousFunnel: FunnelCounts;
  changes: {
    views: number | null;
    checkouts: number | null;
    payments: number | null;
    purchases: number | null;
  };
  byOrigin: FunnelByOrigin[];
  campaigns: CampaignRow[];
  /** Vendas pagas no período, pela origem registrada no pedido; balcão à parte. */
  sales: { origin: OriginKey | 'POS'; orders: number; tickets: number; valueCents: number }[];
}

interface LinhaDoFunil {
  type: TrackingEventTypeKey;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  visitantes: number;
  pedidos: number;
  valor: bigint | number;
}

function vazio(): FunnelCounts {
  return { views: 0, checkouts: 0, payments: 0, purchases: 0, purchaseValueCents: 0 };
}

function somarNoFunil(alvo: FunnelCounts, linha: LinhaDoFunil): void {
  if (linha.type === 'VIEW_TICKETS') alvo.views += linha.visitantes;
  if (linha.type === 'CHECKOUT_STARTED') alvo.checkouts += linha.visitantes;
  if (linha.type === 'PAYMENT_STARTED') alvo.payments += linha.pedidos;
  if (linha.type === 'PURCHASE') {
    alvo.purchases += linha.pedidos;
    alvo.purchaseValueCents += rawNumber(linha.valor);
  }
}

function linhasDoFunil(db: DbClient, parkId: string, inicio: Date, fim: Date): Promise<LinhaDoFunil[]> {
  return db.$queryRaw<LinhaDoFunil[]>`
    SELECT type::text AS type,
      lower(NULLIF(btrim(utm_source), '')) AS source,
      lower(NULLIF(btrim(utm_medium), '')) AS medium,
      NULLIF(btrim(utm_campaign), '') AS campaign,
      CASE WHEN referrer IS NULL THEN NULL
        ELSE 'https://' || lower(substring(referrer from '^[a-zA-Z]+://([^/:?#]+)')) END AS referrer,
      COUNT(DISTINCT COALESCE(visitor_id, id::text))::int AS visitantes,
      COUNT(DISTINCT order_id)::int AS pedidos,
      COALESCE(SUM(value_cents), 0)::bigint AS valor
    FROM tracking_events
    WHERE park_id = ${parkId}::uuid AND created_at >= ${inicio} AND created_at < ${fim}
    GROUP BY 1, 2, 3, 4, 5`;
}

function conversao(contagem: FunnelCounts): number | null {
  return contagem.views > 0 ? contagem.purchases / contagem.views : null;
}

export async function getMarketingOverview(
  auth: AuthContext,
  periodo: ParsedPeriod,
  db: DbClient = prisma,
): Promise<MarketingOverview> {
  requirePermission(auth, 'marketing.view');
  const parkId = auth.park.id;
  const fuso = auth.park.timezone;
  const valores = can(auth, 'finance.view') || can(auth, 'dashboard.financial');
  const anterior = previousRange(periodo.range);
  const instante = (data: DateOnly) => zonedTimeToInstant(data, '00:00', fuso);
  const inicio = instante(periodo.range.from);
  const fim = instante(addDays(periodo.range.to, 1));
  const dominio = hostOf(env().APP_URL);

  const [atuais, passadas, vendas] = await Promise.all([
    linhasDoFunil(db, parkId, inicio, fim),
    linhasDoFunil(db, parkId, instante(anterior.from), inicio),
    db.$queryRaw<
      {
        channel: 'ONLINE' | 'POS';
        source: string | null;
        referrer: string | null;
        orders: number;
        tickets: number;
        valor: bigint | number;
      }[]
    >`
      SELECT o.channel::text AS channel,
        lower(NULLIF(btrim(o.utm_source), '')) AS source,
        CASE WHEN o.referrer IS NULL THEN NULL
          ELSE 'https://' || lower(substring(o.referrer from '^[a-zA-Z]+://([^/:?#]+)')) END AS referrer,
        COUNT(*)::int AS orders,
        COALESCE(SUM(t.quantidade), 0)::int AS tickets,
        COALESCE(SUM(o.total_cents), 0)::bigint AS valor
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS quantidade FROM tickets
        WHERE order_id = o.id AND status IN ('ACTIVE', 'CHECKED_IN')
      ) t ON true
      WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel IN ('ONLINE', 'POS')
        AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
      GROUP BY 1, 2, 3`,
  ]);

  const origemDa = (linha: { source: string | null; referrer: string | null }): OriginKey =>
    originOf({ utmSource: linha.source, referrerHost: hostOf(linha.referrer), ownHost: dominio });

  const funil = vazio();
  const funilAnterior = vazio();
  const porOrigem = new Map<OriginKey, FunnelCounts>();
  const porCampanha = new Map<string, CampaignRow>();
  for (const linha of atuais) {
    somarNoFunil(funil, linha);
    const origem = origemDa(linha);
    const daOrigem = porOrigem.get(origem) ?? vazio();
    somarNoFunil(daOrigem, linha);
    porOrigem.set(origem, daOrigem);
    if (linha.campaign) {
      const chave = [linha.campaign, linha.source ?? '', linha.medium ?? ''].join(' ');
      const daCampanha = porCampanha.get(chave) ?? {
        ...vazio(),
        campaign: linha.campaign,
        source: linha.source,
        medium: linha.medium,
        conversion: null,
      };
      somarNoFunil(daCampanha, linha);
      porCampanha.set(chave, daCampanha);
    }
  }
  for (const linha of passadas) somarNoFunil(funilAnterior, linha);

  const semValor = <T extends FunnelCounts>(item: T): T =>
    valores ? item : { ...item, purchaseValueCents: 0 };

  const vendasPorOrigem = new Map<
    OriginKey | 'POS',
    { orders: number; tickets: number; valueCents: number }
  >();
  for (const linha of vendas) {
    const origem = linha.channel === 'POS' ? 'POS' : origemDa(linha);
    const atual = vendasPorOrigem.get(origem) ?? { orders: 0, tickets: 0, valueCents: 0 };
    atual.orders += linha.orders;
    atual.tickets += linha.tickets;
    atual.valueCents += valores ? rawNumber(linha.valor) : 0;
    vendasPorOrigem.set(origem, atual);
  }

  return {
    period: { ...periodo, previous: anterior },
    showValues: valores,
    funnel: semValor(funil),
    previousFunnel: semValor(funilAnterior),
    changes: {
      views: percentChange(funil.views, funilAnterior.views),
      checkouts: percentChange(funil.checkouts, funilAnterior.checkouts),
      payments: percentChange(funil.payments, funilAnterior.payments),
      purchases: percentChange(funil.purchases, funilAnterior.purchases),
    },
    byOrigin: ORIGINS.flatMap((origem) => {
      const contagem = porOrigem.get(origem);
      return contagem ? [semValor({ ...contagem, origin: origem, conversion: conversao(contagem) })] : [];
    }).sort((a, b) => b.purchases - a.purchases || b.views - a.views),
    campaigns: [...porCampanha.values()]
      .map((campanha) => semValor({ ...campanha, conversion: conversao(campanha) }))
      .sort((a, b) => b.purchases - a.purchases || b.views - a.views)
      .slice(0, 30),
    sales: [...ORIGINS, 'POS' as const]
      .flatMap((origem) => {
        const valoresDaOrigem = vendasPorOrigem.get(origem);
        return valoresDaOrigem ? [{ origin: origem, ...valoresDaOrigem }] : [];
      })
      .sort((a, b) => b.orders - a.orders),
  };
}
