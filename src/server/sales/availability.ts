import 'server-only';

import type { HolderDataKey, TicketCategoryKey } from '@/lib/catalog';
import {
  compareDateOnly,
  dateOnlyToDb,
  dbToDateOnly,
  diffDays,
  formatTimeBR,
  todayIn,
  type DateOnly,
} from '@/lib/dates';
import { resolvePrice, type DayKind } from '@/lib/pricing';
import type { SalesSettings } from '@/lib/settings';

import { getCalendarRange } from '../calendar/service';
import { lotSalesByRule, sellableTicketTypes, toPriceRule } from '../catalog/service';
import { prisma, type DbClient, type Tx } from '../db';
import { onlinePaymentsAvailable } from '../env';
import type { PublicPark } from '../parks/public';
import { rawDateOnly } from '../raw';
import { getSalesSettings } from '../settings/service';

/**
 * Disponibilidade para venda: o que pode ser comprado em cada data, quantas
 * vagas restam e as travas usadas por carrinho, compra e confirmação.
 */

// ─── Travas e ocupação ──────────────────────────────────────────────────────

export interface LockedParkDay {
  id: string;
  date: DateOnly;
  status: 'OPEN' | 'CLOSED';
  capacity: number;
  opensAt: string | null;
  closesAt: string | null;
  dayKind: DayKind | null;
  label: string | null;
}

interface LinhaDoDia {
  id: string;
  date: Date | string;
  status: 'OPEN' | 'CLOSED';
  capacity: number;
  opens_at: string | null;
  closes_at: string | null;
  day_kind: DayKind | null;
  label: string | null;
}

function paraDia(linha: LinhaDoDia | undefined): LockedParkDay | null {
  if (!linha) return null;
  return {
    id: linha.id,
    date: rawDateOnly(linha.date) ?? '',
    status: linha.status,
    capacity: linha.capacity,
    opensAt: linha.opens_at,
    closesAt: linha.closes_at,
    dayKind: linha.day_kind,
    label: linha.label,
  };
}

/** Trava o dia até o fim da transação: vendas do mesmo dia passam uma de cada vez. */
export async function lockParkDayByDate(
  tx: Tx,
  parkId: string,
  date: DateOnly,
): Promise<LockedParkDay | null> {
  const linhas = await tx.$queryRaw<LinhaDoDia[]>`
    SELECT id, date, status, capacity, opens_at, closes_at, day_kind, label
    FROM park_days
    WHERE park_id = ${parkId}::uuid AND date = ${date}::date
    FOR UPDATE`;
  return paraDia(linhas[0]);
}

export async function lockParkDayById(tx: Tx, parkDayId: string): Promise<LockedParkDay | null> {
  const linhas = await tx.$queryRaw<LinhaDoDia[]>`
    SELECT id, date, status, capacity, opens_at, closes_at, day_kind, label
    FROM park_days
    WHERE id = ${parkDayId}::uuid
    FOR UPDATE`;
  return paraDia(linhas[0]);
}

/**
 * Pessoas que ocupam vaga no dia: ingressos válidos ou já utilizados, mais
 * reservas ativas no prazo (carrinhos e pedidos aguardando pagamento).
 */
export async function occupiedPeople(
  db: DbClient,
  parkDayId: string,
  excludeHoldId: string | null = null,
): Promise<number> {
  const [linha] = await db.$queryRaw<{ occupied: number }[]>`
    SELECT (
      (SELECT COUNT(*) FROM tickets
        WHERE park_day_id = ${parkDayId}::uuid AND status IN ('ACTIVE', 'CHECKED_IN') AND occupies_capacity)
      + COALESCE((SELECT SUM(people) FROM capacity_holds
        WHERE park_day_id = ${parkDayId}::uuid AND status = 'ACTIVE' AND expires_at > now()
          AND (${excludeHoldId}::uuid IS NULL OR id <> ${excludeHoldId}::uuid)), 0)
    )::int AS occupied`;
  return linha?.occupied ?? 0;
}

/** Motivo para a data não estar à venda pelo site agora, ou `null` se pode vender. */
export function onlineSaleBlocker(input: {
  date: DateOnly;
  today: DateOnly;
  now: Date;
  timeZone: string;
  settings: SalesSettings;
  day: { status: 'OPEN' | 'CLOSED'; closesAt: string | null } | null;
}): string | null {
  const { date, today, settings } = input;
  if (!settings.onlineSalesEnabled || !onlinePaymentsAvailable()) {
    return 'As vendas pelo site estão pausadas no momento. Tente novamente mais tarde.';
  }
  if (compareDateOnly(date, today) < 0) return 'Esta data já passou. Escolha outra data.';
  if (diffDays(today, date) > settings.maxDaysAhead) {
    return `As vendas pelo site abrem com até ${settings.maxDaysAhead} dias de antecedência.`;
  }
  if (!input.day || input.day.status !== 'OPEN') return 'O parque não abre nesta data.';
  if (date === today) {
    const agora = formatTimeBR(input.now, input.timeZone);
    if (settings.sameDaySalesUntil && agora >= settings.sameDaySalesUntil) {
      return `As vendas pelo site para hoje foram até as ${settings.sameDaySalesUntil}. Escolha outra data.`;
    }
    if (input.day.closesAt && agora >= input.day.closesAt)
      return 'O parque já fechou hoje. Escolha outra data.';
  }
  return null;
}

// ─── Site público ───────────────────────────────────────────────────────────

export type PublicDayStatus = 'AVAILABLE' | 'FEW_LEFT' | 'SOLD_OUT' | 'CLOSED' | 'UNAVAILABLE';

export interface PublicCalendarDay {
  date: DateOnly;
  status: PublicDayStatus;
  opensAt: string | null;
  closesAt: string | null;
  label: string | null;
  /** Menor preço cobrado entre os ingressos à venda na data. */
  fromPriceCents: number | null;
  reason: string | null;
}

function tipoDisponivelNaData(
  tipo: { availableFrom: Date | null; availableUntil: Date | null },
  data: DateOnly,
): boolean {
  if (tipo.availableFrom && compareDateOnly(data, dbToDateOnly(tipo.availableFrom)) < 0) return false;
  if (tipo.availableUntil && compareDateOnly(data, dbToDateOnly(tipo.availableUntil)) > 0) return false;
  return true;
}

/** Calendário de compra: situação de cada dia e o preço "a partir de". */
export async function getPublicCalendar(
  park: PublicPark,
  from: DateOnly,
  to: DateOnly,
  db: DbClient = prisma,
  now: Date = new Date(),
): Promise<PublicCalendarDay[]> {
  const [config, dias, tipos] = await Promise.all([
    getSalesSettings(park.id, db),
    getCalendarRange(park.id, from, to, db),
    db.ticketType.findMany({
      where: { parkId: park.id, isActive: true, channels: { has: 'ONLINE' } },
      include: { prices: true },
    }),
  ]);
  const vendidosPorLote = await lotSalesByRule(
    db,
    tipos.flatMap((tipo) =>
      tipo.prices.filter((preco) => preco.lotQuantity !== null).map((preco) => preco.id),
    ),
  );
  const regras = new Map(tipos.map((tipo) => [tipo.id, tipo.prices.map(toPriceRule)]));
  const hoje = todayIn(park.timezone, now);

  return dias.map((dia) => {
    const base = { date: dia.date, opensAt: dia.opensAt, closesAt: dia.closesAt, label: dia.label };
    const bloqueio = onlineSaleBlocker({
      date: dia.date,
      today: hoje,
      now,
      timeZone: park.timezone,
      settings: config,
      day: dia.status ? { status: dia.status, closesAt: dia.closesAt } : null,
    });
    if (bloqueio) {
      return {
        ...base,
        status: dia.status === 'OPEN' ? 'UNAVAILABLE' : 'CLOSED',
        fromPriceCents: null,
        reason: bloqueio,
      };
    }

    const precos = tipos
      .filter((tipo) => tipoDisponivelNaData(tipo, dia.date))
      .map(
        (tipo) =>
          resolvePrice({
            basePriceCents: tipo.basePriceCents,
            rules: regras.get(tipo.id) ?? [],
            visitDate: dia.date,
            dayKindOverride: dia.dayKindOverride,
            now,
            soldByRule: vendidosPorLote,
          }).priceCents,
      )
      .filter((preco) => preco > 0);
    const livres = dia.available ?? 0;
    const capacidade = dia.capacity ?? 0;
    const status: PublicDayStatus =
      livres <= 0
        ? 'SOLD_OUT'
        : livres < Math.max(20, Math.ceil(capacidade * 0.1))
          ? 'FEW_LEFT'
          : 'AVAILABLE';

    return {
      ...base,
      status,
      fromPriceCents: precos.length > 0 ? Math.min(...precos) : null,
      reason: status === 'SOLD_OUT' ? 'Ingressos esgotados para esta data.' : null,
    };
  });
}

export interface PublicTicketOffer {
  id: string;
  name: string;
  description: string | null;
  category: TicketCategoryKey;
  priceCents: number;
  compareAtCents: number | null;
  priceLabel: string | null;
  minAge: number | null;
  maxAge: number | null;
  peoplePerTicket: number;
  occupiesCapacity: boolean;
  minPerOrder: number | null;
  maxPerOrder: number | null;
  holderData: HolderDataKey;
  requiresDocument: boolean;
  documentHint: string | null;
  rulesText: string | null;
  /** Quanto ainda dá para comprar deste tipo na data; `null` sem limite próprio. */
  remainingUnits: number | null;
}

export interface PublicDateOffer {
  date: DateOnly;
  blocker: string | null;
  day: { opensAt: string | null; closesAt: string | null; label: string | null } | null;
  /** Vagas livres no dia. */
  available: number | null;
  maxTicketsPerOrder: number;
  ticketTypes: PublicTicketOffer[];
}

/** Ingressos à venda numa data, com preço do momento e vagas restantes. */
export async function getPublicDateOffer(
  park: PublicPark,
  date: DateOnly,
  db: DbClient = prisma,
  now: Date = new Date(),
): Promise<PublicDateOffer> {
  const [config, dia] = await Promise.all([
    getSalesSettings(park.id, db),
    db.parkDay.findUnique({ where: { parkId_date: { parkId: park.id, date: dateOnlyToDb(date) } } }),
  ]);
  const infoDoDia = dia ? { opensAt: dia.opensAt, closesAt: dia.closesAt, label: dia.label } : null;
  const bloqueio = onlineSaleBlocker({
    date,
    today: todayIn(park.timezone, now),
    now,
    timeZone: park.timezone,
    settings: config,
    day: dia ? { status: dia.status, closesAt: dia.closesAt } : null,
  });
  if (bloqueio || !dia) {
    return {
      date,
      blocker: bloqueio ?? 'O parque não abre nesta data.',
      day: infoDoDia,
      available: null,
      maxTicketsPerOrder: config.maxTicketsPerOrder,
      ticketTypes: [],
    };
  }

  const [tipos, ocupadas] = await Promise.all([
    sellableTicketTypes(db, {
      parkId: park.id,
      parkDayId: dia.id,
      date,
      dayKindOverride: dia.dayKind,
      channel: 'ONLINE',
      now,
    }),
    occupiedPeople(db, dia.id),
  ]);
  const livres = Math.max(0, dia.capacity - ocupadas);

  return {
    date,
    blocker: livres === 0 ? 'Ingressos esgotados para esta data.' : null,
    day: infoDoDia,
    available: livres,
    maxTicketsPerOrder: config.maxTicketsPerOrder,
    ticketTypes: tipos.map((tipo) => ({
      id: tipo.id,
      name: tipo.name,
      description: tipo.description,
      category: tipo.category,
      priceCents: tipo.priceCents,
      compareAtCents: tipo.compareAtCents,
      priceLabel: tipo.priceLabel,
      minAge: tipo.minAge,
      maxAge: tipo.maxAge,
      peoplePerTicket: tipo.peoplePerTicket,
      occupiesCapacity: tipo.occupiesCapacity,
      minPerOrder: tipo.minPerOrder,
      maxPerOrder: tipo.maxPerOrder,
      holderData: tipo.holderData,
      requiresDocument: tipo.requiresDocument,
      documentHint: tipo.documentHint,
      rulesText: tipo.rulesText,
      remainingUnits: tipo.remainingUnits,
    })),
  };
}
