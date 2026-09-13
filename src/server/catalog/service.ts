import 'server-only';

import type { Prisma, PrismaClient, TicketPrice, TicketType } from '@/generated/prisma/client';
import {
  priceRuleInputSchema,
  ticketTypeInputSchema,
  type HolderDataKey,
  type PriceRuleInput,
  type SalesChannelKey,
  type TicketCategoryKey,
  type TicketTypeInput,
} from '@/lib/catalog';
import {
  addDays,
  compareDateOnly,
  dateOnlyOf,
  dateOnlyToDb,
  dbToDateOnly,
  todayIn,
  zonedTimeToInstant,
  type DateOnly,
} from '@/lib/dates';
import { resolvePrice, type DayKind, type PriceRule, type ResolvedPrice } from '@/lib/pricing';
import { slugify } from '@/lib/slug';

import { recordAudit } from '../audit';
import { requirePermission, type AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { AppError, Errors, fromZodError } from '../errors';
import type { RequestMeta } from '../request';

/**
 * Tipos de ingresso e regras de preço. O preço de venda é sempre calculado
 * aqui, no servidor, para a data e o momento da compra.
 */

export function toPriceRule(preco: TicketPrice): PriceRule {
  return {
    id: preco.id,
    name: preco.name,
    priceCents: preco.priceCents,
    compareAtCents: preco.compareAtCents,
    dayKinds: preco.dayKinds,
    visitFrom: preco.visitFrom ? dbToDateOnly(preco.visitFrom) : null,
    visitUntil: preco.visitUntil ? dbToDateOnly(preco.visitUntil) : null,
    saleStartsAt: preco.saleStartsAt,
    saleEndsAt: preco.saleEndsAt,
    lotQuantity: preco.lotQuantity,
    priority: preco.priority,
    isActive: preco.isActive,
    createdAt: preco.createdAt,
  };
}

/** Ingressos vendidos ou reservados (em pedido válido) em cada regra com lote. */
export async function lotSalesByRule(db: DbClient, ruleIds: readonly string[]): Promise<Map<string, number>> {
  if (ruleIds.length === 0) return new Map();
  const linhas = await db.$queryRaw<{ id: string; units: number }[]>`
    SELECT oi.ticket_price_id AS id, SUM(oi.quantity)::int AS units
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.ticket_price_id = ANY(${[...ruleIds]}::uuid[])
      AND (o.status = 'CONFIRMED' OR (o.status = 'PENDING_PAYMENT' AND o.expires_at > now()))
    GROUP BY oi.ticket_price_id`;
  return new Map(linhas.map((linha) => [linha.id, linha.units]));
}

/** Unidades de cada tipo já comprometidas num dia: pedidos confirmados + reservas válidas. */
export async function unitsByTypeForDay(db: DbClient, parkDayId: string): Promise<Map<string, number>> {
  const linhas = await db.$queryRaw<{ id: string; units: number }[]>`
    SELECT ticket_type_id AS id, SUM(unidades)::int AS units
    FROM (
      SELECT oi.ticket_type_id, oi.quantity AS unidades
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.park_day_id = ${parkDayId}::uuid AND o.status = 'CONFIRMED'
      UNION ALL
      SELECT hi.ticket_type_id, hi.quantity
      FROM capacity_hold_items hi
      JOIN capacity_holds h ON h.id = hi.hold_id
      WHERE h.park_day_id = ${parkDayId}::uuid AND h.status = 'ACTIVE' AND h.expires_at > now()
    ) comprometidas
    GROUP BY ticket_type_id`;
  return new Map(linhas.map((linha) => [linha.id, linha.units]));
}

export interface SellableTicketType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: TicketCategoryKey;
  priceCents: number;
  compareAtCents: number | null;
  priceRuleId: string | null;
  priceLabel: string | null;
  minAge: number | null;
  maxAge: number | null;
  holderData: HolderDataKey;
  requiresDocument: boolean;
  documentHint: string | null;
  occupiesCapacity: boolean;
  peoplePerTicket: number;
  minPerOrder: number | null;
  maxPerOrder: number | null;
  maxPerCustomerPerDay: number | null;
  rulesText: string | null;
  /** Unidades ainda disponíveis na cota do dia; `null` quando o tipo não tem cota. */
  remainingUnits: number | null;
}

function disponivelNaData(tipo: TicketType, data: DateOnly): boolean {
  if (tipo.availableFrom && compareDateOnly(data, dbToDateOnly(tipo.availableFrom)) < 0) return false;
  if (tipo.availableUntil && compareDateOnly(data, dbToDateOnly(tipo.availableUntil)) > 0) return false;
  return true;
}

/** Tipos à venda numa data e canal, já com preço calculado e cota restante. */
export async function sellableTicketTypes(
  db: DbClient,
  input: {
    parkId: string;
    parkDayId: string;
    date: DateOnly;
    dayKindOverride: DayKind | null;
    channel: SalesChannelKey;
    now: Date;
    /** Quantidade pretendida por tipo (para conferir lote). */
    quantities?: ReadonlyMap<string, number>;
  },
): Promise<SellableTicketType[]> {
  const tipos = await db.ticketType.findMany({
    where: { parkId: input.parkId, isActive: true, channels: { has: input.channel } },
    include: { prices: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  const visiveis = tipos.filter((tipo) => disponivelNaData(tipo, input.date));
  const regrasComLote = visiveis.flatMap((tipo) =>
    tipo.prices.filter((preco) => preco.lotQuantity !== null).map((preco) => preco.id),
  );
  const [vendasPorLote, unidadesNoDia] = await Promise.all([
    lotSalesByRule(db, regrasComLote),
    unitsByTypeForDay(db, input.parkDayId),
  ]);

  return visiveis.map((tipo) => {
    const preco = resolvePrice({
      basePriceCents: tipo.basePriceCents,
      rules: tipo.prices.map(toPriceRule),
      visitDate: input.date,
      dayKindOverride: input.dayKindOverride,
      now: input.now,
      soldByRule: vendasPorLote,
      quantity: input.quantities?.get(tipo.id) ?? 1,
    });
    return {
      id: tipo.id,
      slug: tipo.slug,
      name: tipo.name,
      description: tipo.description,
      category: tipo.category,
      priceCents: preco.priceCents,
      compareAtCents: preco.compareAtCents,
      priceRuleId: preco.ruleId,
      priceLabel: preco.label,
      minAge: tipo.minAge,
      maxAge: tipo.maxAge,
      holderData: tipo.holderData,
      requiresDocument: tipo.requiresDocument,
      documentHint: tipo.documentHint,
      occupiesCapacity: tipo.occupiesCapacity,
      peoplePerTicket: tipo.peoplePerTicket,
      minPerOrder: tipo.minPerOrder,
      maxPerOrder: tipo.maxPerOrder,
      maxPerCustomerPerDay: tipo.maxPerCustomerPerDay,
      rulesText: tipo.rulesText,
      remainingUnits:
        tipo.dailyQuota === null ? null : Math.max(0, tipo.dailyQuota - (unidadesNoDia.get(tipo.id) ?? 0)),
    };
  });
}

// ─── Painel ─────────────────────────────────────────────────────────────────

export interface AdminPriceRule {
  id: string;
  name: string;
  priceCents: number;
  compareAtCents: number | null;
  dayKinds: DayKind[];
  visitFrom: DateOnly | null;
  visitUntil: DateOnly | null;
  saleFrom: DateOnly | null;
  saleUntil: DateOnly | null;
  lotQuantity: number | null;
  lotSold: number | null;
  priority: number;
  isActive: boolean;
}

export interface AdminTicketType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: TicketCategoryKey;
  basePriceCents: number;
  todayPrice: ResolvedPrice;
  minAge: number | null;
  maxAge: number | null;
  holderData: HolderDataKey;
  requiresDocument: boolean;
  documentHint: string | null;
  occupiesCapacity: boolean;
  peoplePerTicket: number;
  dailyQuota: number | null;
  minPerOrder: number | null;
  maxPerOrder: number | null;
  maxPerCustomerPerDay: number | null;
  channels: SalesChannelKey[];
  availableFrom: DateOnly | null;
  availableUntil: DateOnly | null;
  rulesText: string | null;
  sortOrder: number;
  isActive: boolean;
  soldUnits: number;
  prices: AdminPriceRule[];
}

type TipoComPrecos = TicketType & { prices: TicketPrice[] };

function paraRegraDoPainel(
  preco: TicketPrice,
  timeZone: string,
  vendidos: ReadonlyMap<string, number>,
): AdminPriceRule {
  return {
    id: preco.id,
    name: preco.name,
    priceCents: preco.priceCents,
    compareAtCents: preco.compareAtCents,
    dayKinds: preco.dayKinds,
    visitFrom: preco.visitFrom ? dbToDateOnly(preco.visitFrom) : null,
    visitUntil: preco.visitUntil ? dbToDateOnly(preco.visitUntil) : null,
    saleFrom: preco.saleStartsAt ? dateOnlyOf(preco.saleStartsAt, timeZone) : null,
    // O fim é exclusivo (meia-noite do dia seguinte); o painel mostra o último dia de venda.
    saleUntil: preco.saleEndsAt ? dateOnlyOf(new Date(preco.saleEndsAt.getTime() - 1), timeZone) : null,
    lotQuantity: preco.lotQuantity,
    lotSold: preco.lotQuantity === null ? null : (vendidos.get(preco.id) ?? 0),
    priority: preco.priority,
    isActive: preco.isActive,
  };
}

async function montarTiposDoPainel(
  db: DbClient,
  auth: AuthContext,
  tipos: TipoComPrecos[],
): Promise<AdminTicketType[]> {
  const hoje = todayIn(auth.park.timezone);
  const [diaDeHoje, vendidosPorLote, vendidosPorTipo] = await Promise.all([
    db.parkDay.findUnique({
      where: { parkId_date: { parkId: auth.park.id, date: dateOnlyToDb(hoje) } },
      select: { dayKind: true },
    }),
    lotSalesByRule(
      db,
      tipos.flatMap((tipo) =>
        tipo.prices.filter((preco) => preco.lotQuantity !== null).map((preco) => preco.id),
      ),
    ),
    tipos.length === 0
      ? Promise.resolve([] as { id: string; units: number }[])
      : db.$queryRaw<{ id: string; units: number }[]>`
          SELECT oi.ticket_type_id AS id, SUM(oi.quantity)::int AS units
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.ticket_type_id = ANY(${tipos.map((tipo) => tipo.id)}::uuid[]) AND o.status = 'CONFIRMED'
          GROUP BY oi.ticket_type_id`,
  ]);
  const unidades = new Map(vendidosPorTipo.map((linha) => [linha.id, linha.units]));
  const agora = new Date();

  return tipos.map((tipo) => ({
    id: tipo.id,
    slug: tipo.slug,
    name: tipo.name,
    description: tipo.description,
    category: tipo.category,
    basePriceCents: tipo.basePriceCents,
    todayPrice: resolvePrice({
      basePriceCents: tipo.basePriceCents,
      rules: tipo.prices.map(toPriceRule),
      visitDate: hoje,
      dayKindOverride: diaDeHoje?.dayKind ?? null,
      now: agora,
      soldByRule: vendidosPorLote,
    }),
    minAge: tipo.minAge,
    maxAge: tipo.maxAge,
    holderData: tipo.holderData,
    requiresDocument: tipo.requiresDocument,
    documentHint: tipo.documentHint,
    occupiesCapacity: tipo.occupiesCapacity,
    peoplePerTicket: tipo.peoplePerTicket,
    dailyQuota: tipo.dailyQuota,
    minPerOrder: tipo.minPerOrder,
    maxPerOrder: tipo.maxPerOrder,
    maxPerCustomerPerDay: tipo.maxPerCustomerPerDay,
    channels: tipo.channels,
    availableFrom: tipo.availableFrom ? dbToDateOnly(tipo.availableFrom) : null,
    availableUntil: tipo.availableUntil ? dbToDateOnly(tipo.availableUntil) : null,
    rulesText: tipo.rulesText,
    sortOrder: tipo.sortOrder,
    isActive: tipo.isActive,
    soldUnits: unidades.get(tipo.id) ?? 0,
    prices: [...tipo.prices]
      .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime())
      .map((preco) => paraRegraDoPainel(preco, auth.park.timezone, vendidosPorLote)),
  }));
}

export async function listTicketTypesAdmin(
  auth: AuthContext,
  db: DbClient = prisma,
): Promise<AdminTicketType[]> {
  requirePermission(auth, 'ticket_types.view');
  const tipos = await db.ticketType.findMany({
    where: { parkId: auth.park.id },
    include: { prices: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return montarTiposDoPainel(db, auth, tipos);
}

export async function getTicketTypeAdmin(
  auth: AuthContext,
  id: string,
  db: DbClient = prisma,
): Promise<AdminTicketType> {
  requirePermission(auth, 'ticket_types.view');
  const tipo = await db.ticketType.findFirst({
    where: { id, parkId: auth.park.id },
    include: { prices: true },
  });
  if (!tipo) throw Errors.notFound('Tipo de ingresso não encontrado.');
  const [resultado] = await montarTiposDoPainel(db, auth, [tipo]);
  if (!resultado) throw Errors.notFound('Tipo de ingresso não encontrado.');
  return resultado;
}

function dadosDoTipo(valores: ReturnType<typeof ticketTypeInputSchema.parse>) {
  return {
    name: valores.name,
    description: valores.description,
    category: valores.category,
    basePriceCents: valores.basePriceCents,
    minAge: valores.minAge,
    maxAge: valores.maxAge,
    holderData: valores.holderData,
    requiresDocument: valores.requiresDocument,
    documentHint: valores.requiresDocument ? valores.documentHint : null,
    occupiesCapacity: valores.occupiesCapacity,
    peoplePerTicket: valores.peoplePerTicket,
    dailyQuota: valores.dailyQuota,
    minPerOrder: valores.minPerOrder,
    maxPerOrder: valores.maxPerOrder,
    maxPerCustomerPerDay: valores.maxPerCustomerPerDay,
    channels: valores.channels,
    availableFrom: valores.availableFrom ? dateOnlyToDb(valores.availableFrom) : null,
    availableUntil: valores.availableUntil ? dateOnlyToDb(valores.availableUntil) : null,
    rulesText: valores.rulesText,
    isActive: valores.isActive,
  } satisfies Prisma.TicketTypeUncheckedUpdateInput;
}

async function slugDisponivel(
  db: DbClient,
  parkId: string,
  nome: string,
  ignorarId?: string,
): Promise<string> {
  const base = slugify(nome) || 'ingresso';
  for (let tentativa = 1; tentativa < 100; tentativa++) {
    const candidato = tentativa === 1 ? base : `${base.slice(0, 55)}-${tentativa}`;
    const existente = await db.ticketType.findUnique({
      where: { parkId_slug: { parkId, slug: candidato } },
      select: { id: true },
    });
    if (!existente || existente.id === ignorarId) return candidato;
  }
  throw Errors.conflict('Não foi possível gerar um identificador para este ingresso. Use outro nome.');
}

export async function createTicketType(
  auth: AuthContext,
  input: TicketTypeInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminTicketType> {
  requirePermission(auth, 'ticket_types.manage', 'prices.manage');
  const parsed = ticketTypeInputSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);

  const id = await db.$transaction(async (tx) => {
    const slug = await slugDisponivel(tx, auth.park.id, parsed.data.name);
    const ultimo = await tx.ticketType.aggregate({
      where: { parkId: auth.park.id },
      _max: { sortOrder: true },
    });
    const criado = await tx.ticketType.create({
      data: {
        ...dadosDoTipo(parsed.data),
        parkId: auth.park.id,
        slug,
        sortOrder: (ultimo._max.sortOrder ?? 0) + 1,
      },
    });
    await recordAudit(tx, {
      action: 'ticket_types.created',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'ticket_type',
      entityId: criado.id,
      after: parsed.data,
      meta,
    });
    return criado.id;
  });
  return getTicketTypeAdmin(auth, id, db);
}

export async function updateTicketType(
  auth: AuthContext,
  id: string,
  input: TicketTypeInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminTicketType> {
  requirePermission(auth, 'ticket_types.manage');
  const parsed = ticketTypeInputSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);

  await db.$transaction(async (tx) => {
    const atual = await tx.ticketType.findFirst({ where: { id, parkId: auth.park.id } });
    if (!atual) throw Errors.notFound('Tipo de ingresso não encontrado.');
    if (atual.basePriceCents !== parsed.data.basePriceCents) requirePermission(auth, 'prices.manage');

    const dados = dadosDoTipo(parsed.data);
    const slug =
      atual.name === parsed.data.name
        ? atual.slug
        : await slugDisponivel(tx, auth.park.id, parsed.data.name, id);
    await tx.ticketType.update({ where: { id }, data: { ...dados, slug } });

    const antes = {
      name: atual.name,
      category: atual.category,
      basePriceCents: atual.basePriceCents,
      channels: atual.channels,
      dailyQuota: atual.dailyQuota,
      holderData: atual.holderData,
      isActive: atual.isActive,
    };
    await recordAudit(tx, {
      action: 'ticket_types.updated',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'ticket_type',
      entityId: id,
      before: antes,
      after: {
        name: parsed.data.name,
        category: parsed.data.category,
        basePriceCents: parsed.data.basePriceCents,
        channels: parsed.data.channels,
        dailyQuota: parsed.data.dailyQuota,
        holderData: parsed.data.holderData,
        isActive: parsed.data.isActive,
      },
      meta,
    });
  });
  return getTicketTypeAdmin(auth, id, db);
}

export async function moveTicketType(
  auth: AuthContext,
  id: string,
  direction: 'up' | 'down',
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<void> {
  requirePermission(auth, 'ticket_types.manage');
  await db.$transaction(async (tx) => {
    const tipos = await tx.ticketType.findMany({
      where: { parkId: auth.park.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });
    const posicao = tipos.findIndex((tipo) => tipo.id === id);
    if (posicao < 0) throw Errors.notFound('Tipo de ingresso não encontrado.');
    const destino = direction === 'up' ? posicao - 1 : posicao + 1;
    if (destino < 0 || destino >= tipos.length) return;
    const ordem = tipos.map((tipo) => tipo.id);
    [ordem[posicao], ordem[destino]] = [ordem[destino] as string, ordem[posicao] as string];
    for (const [indice, tipoId] of ordem.entries()) {
      await tx.ticketType.update({ where: { id: tipoId }, data: { sortOrder: indice + 1 } });
    }
    await recordAudit(tx, {
      action: 'ticket_types.reordered',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'ticket_type',
      entityId: id,
      data: { direction },
      meta,
    });
  });
}

// ─── Regras de preço ────────────────────────────────────────────────────────

function dadosDaRegra(valores: ReturnType<typeof priceRuleInputSchema.parse>, timeZone: string) {
  return {
    name: valores.name,
    priceCents: valores.priceCents,
    compareAtCents: valores.compareAtCents,
    dayKinds: valores.dayKinds,
    visitFrom: valores.visitFrom ? dateOnlyToDb(valores.visitFrom) : null,
    visitUntil: valores.visitUntil ? dateOnlyToDb(valores.visitUntil) : null,
    saleStartsAt: valores.saleFrom ? zonedTimeToInstant(valores.saleFrom, '00:00', timeZone) : null,
    saleEndsAt: valores.saleUntil
      ? zonedTimeToInstant(addDays(valores.saleUntil, 1), '00:00', timeZone)
      : null,
    lotQuantity: valores.lotQuantity,
    priority: valores.priority,
    isActive: valores.isActive,
  };
}

async function regraDoParque(db: DbClient, auth: AuthContext, ruleId: string): Promise<TicketPrice> {
  const regra = await db.ticketPrice.findFirst({
    where: { id: ruleId, ticketType: { parkId: auth.park.id } },
  });
  if (!regra) throw Errors.notFound('Regra de preço não encontrada.');
  return regra;
}

export async function createPriceRule(
  auth: AuthContext,
  ticketTypeId: string,
  input: PriceRuleInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminTicketType> {
  requirePermission(auth, 'prices.manage');
  const parsed = priceRuleInputSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);

  await db.$transaction(async (tx) => {
    const tipo = await tx.ticketType.findFirst({
      where: { id: ticketTypeId, parkId: auth.park.id },
      select: { id: true },
    });
    if (!tipo) throw Errors.notFound('Tipo de ingresso não encontrado.');
    const regra = await tx.ticketPrice.create({
      data: { ticketTypeId, ...dadosDaRegra(parsed.data, auth.park.timezone) },
    });
    await recordAudit(tx, {
      action: 'prices.rule_created',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'ticket_price',
      entityId: regra.id,
      after: { ticketTypeId, ...parsed.data },
      meta,
    });
  });
  return getTicketTypeAdmin(auth, ticketTypeId, db);
}

export async function updatePriceRule(
  auth: AuthContext,
  ruleId: string,
  input: PriceRuleInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminTicketType> {
  requirePermission(auth, 'prices.manage');
  const parsed = priceRuleInputSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);

  const ticketTypeId = await db.$transaction(async (tx) => {
    const atual = await regraDoParque(tx, auth, ruleId);
    await tx.ticketPrice.update({
      where: { id: ruleId },
      data: dadosDaRegra(parsed.data, auth.park.timezone),
    });
    await recordAudit(tx, {
      action: 'prices.rule_updated',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'ticket_price',
      entityId: ruleId,
      before: paraRegraDoPainel(atual, auth.park.timezone, new Map()),
      after: parsed.data,
      meta,
    });
    return atual.ticketTypeId;
  });
  return getTicketTypeAdmin(auth, ticketTypeId, db);
}

export async function deletePriceRule(
  auth: AuthContext,
  ruleId: string,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminTicketType> {
  requirePermission(auth, 'prices.manage');
  const ticketTypeId = await db.$transaction(async (tx) => {
    const atual = await regraDoParque(tx, auth, ruleId);
    const usada = await tx.orderItem.count({ where: { ticketPriceId: ruleId } });
    if (usada > 0) {
      throw new AppError(
        'CONFLICT',
        'Esta regra já foi usada em vendas e fica no histórico. Desative-a em vez de excluir.',
      );
    }
    await tx.ticketPrice.delete({ where: { id: ruleId } });
    await recordAudit(tx, {
      action: 'prices.rule_deleted',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'ticket_price',
      entityId: ruleId,
      before: paraRegraDoPainel(atual, auth.park.timezone, new Map()),
      meta,
    });
    return atual.ticketTypeId;
  });
  return getTicketTypeAdmin(auth, ticketTypeId, db);
}
