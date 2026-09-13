import 'server-only';

import type { Coupon, PrismaClient } from '@/generated/prisma/client';
import {
  couponInputSchema,
  describeCouponDiscount,
  type CouponInput,
  type CouponState,
} from '@/lib/coupon-schemas';
import {
  couponRejectionMessage,
  evaluateCoupon,
  type CouponChannel,
  type CouponDefinition,
} from '@/lib/coupons';
import {
  addDays,
  dateOnlyOf,
  dateOnlyToDb,
  dbToDateOnly,
  zonedTimeToInstant,
  type DateOnly,
} from '@/lib/dates';
import { effectiveOrderStatus, type OrderStatusKey } from '@/lib/orders';

import { recordAudit } from '../audit';
import { requirePermission, type AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { AppError, Errors, fromZodError } from '../errors';
import { isUniqueViolation } from '../prisma-errors';
import { rawNumber } from '../raw';
import type { RequestMeta } from '../request';

/**
 * Cupons de desconto. As regras ficam em `src/lib/coupons.ts`; aqui ficam o
 * cadastro, a contagem de usos e a aplicação na compra — com trava no cupom,
 * para dois pedidos simultâneos não passarem do limite de usos.
 */

type CupomComTipos = Coupon & { ticketTypes: { ticketTypeId: string }[] };

export function toCouponDefinition(cupom: CupomComTipos): CouponDefinition {
  return {
    discountType: cupom.discountType,
    percentBps: cupom.percentBps,
    amountCents: cupom.amountCents,
    maxDiscountCents: cupom.maxDiscountCents,
    minOrderCents: cupom.minOrderCents,
    startsAt: cupom.startsAt,
    endsAt: cupom.endsAt,
    visitFrom: cupom.visitFrom ? dbToDateOnly(cupom.visitFrom) : null,
    visitUntil: cupom.visitUntil ? dbToDateOnly(cupom.visitUntil) : null,
    weekdays: cupom.weekdays,
    maxUses: cupom.maxUses,
    maxUsesPerCustomer: cupom.maxUsesPerCustomer,
    firstPurchaseOnly: cupom.firstPurchaseOnly,
    channels: cupom.channels,
    ticketTypeIds: cupom.ticketTypes.map((tipo) => tipo.ticketTypeId),
    isActive: cupom.isActive,
  };
}

// ─── Usos ───────────────────────────────────────────────────────────────────

export interface CouponUsageTotals {
  /** Usos em pedidos pagos (ou sem valor a pagar). */
  confirmed: number;
  /** Usos em pedidos aguardando pagamento, ainda no prazo. */
  reserved: number;
  discountCents: number;
  revenueCents: number;
}

const SEM_USO: CouponUsageTotals = { confirmed: 0, reserved: 0, discountCents: 0, revenueCents: 0 };

async function usosPorCupom(db: DbClient, ids: readonly string[]): Promise<Map<string, CouponUsageTotals>> {
  if (ids.length === 0) return new Map();
  const linhas = await db.$queryRaw<
    { id: string; confirmed: number; reserved: number; discount: bigint | number; revenue: bigint | number }[]
  >`
    SELECT u.coupon_id AS id,
      COUNT(*) FILTER (WHERE u.status = 'CONFIRMED')::int AS confirmed,
      COUNT(*) FILTER (
        WHERE u.status = 'RESERVED' AND o.status = 'PENDING_PAYMENT' AND o.expires_at > now()
      )::int AS reserved,
      COALESCE(SUM(u.discount_cents) FILTER (WHERE u.status = 'CONFIRMED'), 0)::bigint AS discount,
      COALESCE(SUM(o.total_cents) FILTER (WHERE u.status = 'CONFIRMED'), 0)::bigint AS revenue
    FROM coupon_usages u
    JOIN orders o ON o.id = u.order_id
    WHERE u.coupon_id = ANY(${[...ids]}::uuid[])
    GROUP BY u.coupon_id`;
  return new Map(
    linhas.map((linha) => [
      linha.id,
      {
        confirmed: linha.confirmed,
        reserved: linha.reserved,
        discountCents: rawNumber(linha.discount),
        revenueCents: rawNumber(linha.revenue),
      },
    ]),
  );
}

// ─── Painel ─────────────────────────────────────────────────────────────────

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FIXED';
  percentBps: number | null;
  amountCents: number | null;
  maxDiscountCents: number | null;
  minOrderCents: number | null;
  startsOn: DateOnly | null;
  endsOn: DateOnly | null;
  visitFrom: DateOnly | null;
  visitUntil: DateOnly | null;
  weekdays: number[];
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  firstPurchaseOnly: boolean;
  channels: ('ONLINE' | 'POS')[];
  ticketTypeIds: string[];
  ticketTypeNames: string[];
  isActive: boolean;
  state: CouponState;
  summary: string;
  createdAt: Date;
  createdByName: string | null;
  usage: CouponUsageTotals;
}

export interface CouponUsageRow {
  orderId: string;
  orderCode: string;
  buyerName: string;
  orderStatus: OrderStatusKey;
  usageStatus: 'RESERVED' | 'CONFIRMED' | 'RELEASED';
  discountCents: number;
  totalCents: number;
  visitDate: DateOnly;
  createdAt: Date;
}

export interface AdminCouponDetail extends AdminCoupon {
  usages: CouponUsageRow[];
}

type CupomDoPainel = CupomComTipos & { createdBy: { name: string } | null };

function estadoDoCupom(cupom: Coupon, uso: CouponUsageTotals, agora: Date): CouponState {
  if (!cupom.isActive) return 'INACTIVE';
  if (cupom.endsAt && cupom.endsAt <= agora) return 'ENDED';
  if (cupom.maxUses !== null && uso.confirmed + uso.reserved >= cupom.maxUses) return 'EXHAUSTED';
  if (cupom.startsAt && cupom.startsAt > agora) return 'SCHEDULED';
  return 'ACTIVE';
}

function paraCupomDoPainel(
  cupom: CupomDoPainel,
  uso: CouponUsageTotals,
  nomes: ReadonlyMap<string, string>,
  timeZone: string,
  agora: Date,
): AdminCoupon {
  const ticketTypeIds = cupom.ticketTypes.map((tipo) => tipo.ticketTypeId);
  return {
    id: cupom.id,
    code: cupom.code,
    description: cupom.description,
    discountType: cupom.discountType,
    percentBps: cupom.percentBps,
    amountCents: cupom.amountCents,
    maxDiscountCents: cupom.maxDiscountCents,
    minOrderCents: cupom.minOrderCents,
    startsOn: cupom.startsAt ? dateOnlyOf(cupom.startsAt, timeZone) : null,
    // O fim gravado é exclusivo (meia-noite do dia seguinte); o painel mostra o último dia.
    endsOn: cupom.endsAt ? dateOnlyOf(new Date(cupom.endsAt.getTime() - 1), timeZone) : null,
    visitFrom: cupom.visitFrom ? dbToDateOnly(cupom.visitFrom) : null,
    visitUntil: cupom.visitUntil ? dbToDateOnly(cupom.visitUntil) : null,
    weekdays: cupom.weekdays,
    maxUses: cupom.maxUses,
    maxUsesPerCustomer: cupom.maxUsesPerCustomer,
    firstPurchaseOnly: cupom.firstPurchaseOnly,
    channels: cupom.channels,
    ticketTypeIds,
    ticketTypeNames: ticketTypeIds.flatMap((id) => {
      const nome = nomes.get(id);
      return nome ? [nome] : [];
    }),
    isActive: cupom.isActive,
    state: estadoDoCupom(cupom, uso, agora),
    summary: describeCouponDiscount(cupom),
    createdAt: cupom.createdAt,
    createdByName: cupom.createdBy?.name ?? null,
    usage: uso,
  };
}

async function nomesDosTipos(db: DbClient, parkId: string): Promise<Map<string, string>> {
  const tipos = await db.ticketType.findMany({ where: { parkId }, select: { id: true, name: true } });
  return new Map(tipos.map((tipo) => [tipo.id, tipo.name]));
}

export async function listCouponsAdmin(auth: AuthContext, db: DbClient = prisma): Promise<AdminCoupon[]> {
  requirePermission(auth, 'coupons.view');
  const [cupons, nomes] = await Promise.all([
    db.coupon.findMany({
      where: { parkId: auth.park.id },
      include: { ticketTypes: { select: { ticketTypeId: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    nomesDosTipos(db, auth.park.id),
  ]);
  const usos = await usosPorCupom(
    db,
    cupons.map((cupom) => cupom.id),
  );
  const agora = new Date();
  return cupons.map((cupom) =>
    paraCupomDoPainel(cupom, usos.get(cupom.id) ?? SEM_USO, nomes, auth.park.timezone, agora),
  );
}

export async function getCouponAdmin(
  auth: AuthContext,
  id: string,
  db: DbClient = prisma,
): Promise<AdminCouponDetail> {
  requirePermission(auth, 'coupons.view');
  const cupom = await db.coupon.findFirst({
    where: { id, parkId: auth.park.id },
    include: { ticketTypes: { select: { ticketTypeId: true } }, createdBy: { select: { name: true } } },
  });
  if (!cupom) throw Errors.notFound('Cupom não encontrado.');

  const [nomes, usos, historico] = await Promise.all([
    nomesDosTipos(db, auth.park.id),
    usosPorCupom(db, [id]),
    db.couponUsage.findMany({
      where: { couponId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        order: {
          select: {
            id: true,
            code: true,
            buyerName: true,
            status: true,
            expiresAt: true,
            totalCents: true,
            visitDate: true,
          },
        },
      },
    }),
  ]);
  const agora = new Date();
  return {
    ...paraCupomDoPainel(cupom, usos.get(id) ?? SEM_USO, nomes, auth.park.timezone, agora),
    usages: historico.map((uso) => ({
      orderId: uso.order.id,
      orderCode: uso.order.code,
      buyerName: uso.order.buyerName,
      orderStatus: effectiveOrderStatus(uso.order, agora),
      usageStatus: uso.status,
      discountCents: uso.discountCents,
      totalCents: uso.order.totalCents,
      visitDate: dbToDateOnly(uso.order.visitDate),
      createdAt: uso.createdAt,
    })),
  };
}

function dadosDoCupom(valores: ReturnType<typeof couponInputSchema.parse>, timeZone: string) {
  const percentual = valores.discountType === 'PERCENT';
  return {
    code: valores.code,
    description: valores.description,
    discountType: valores.discountType,
    percentBps: percentual ? valores.percentBps : null,
    amountCents: percentual ? null : valores.amountCents,
    maxDiscountCents: percentual ? valores.maxDiscountCents : null,
    minOrderCents: valores.minOrderCents,
    startsAt: valores.startsOn ? zonedTimeToInstant(valores.startsOn, '00:00', timeZone) : null,
    endsAt: valores.endsOn ? zonedTimeToInstant(addDays(valores.endsOn, 1), '00:00', timeZone) : null,
    visitFrom: valores.visitFrom ? dateOnlyToDb(valores.visitFrom) : null,
    visitUntil: valores.visitUntil ? dateOnlyToDb(valores.visitUntil) : null,
    weekdays: valores.weekdays,
    maxUses: valores.maxUses,
    maxUsesPerCustomer: valores.maxUsesPerCustomer,
    firstPurchaseOnly: valores.firstPurchaseOnly,
    channels: valores.channels,
    isActive: valores.isActive,
  };
}

async function conferirTipos(db: DbClient, parkId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const encontrados = await db.ticketType.count({ where: { parkId, id: { in: [...ids] } } });
  if (encontrados !== ids.length) {
    throw new AppError('VALIDATION_ERROR', 'Há tipos de ingresso que não existem.', {
      details: { fields: { ticketTypeIds: 'Escolha tipos de ingresso cadastrados' } },
    });
  }
}

function codigoRepetido(code: string): AppError {
  return new AppError('CONFLICT', `Já existe um cupom com o código ${code}.`, {
    details: { fields: { code: 'Já existe um cupom com este código' } },
  });
}

export async function createCoupon(
  auth: AuthContext,
  input: CouponInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminCouponDetail> {
  requirePermission(auth, 'coupons.manage');
  const parsed = couponInputSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const valores = parsed.data;

  try {
    const id = await db.$transaction(async (tx) => {
      await conferirTipos(tx, auth.park.id, valores.ticketTypeIds);
      const criado = await tx.coupon.create({
        data: {
          ...dadosDoCupom(valores, auth.park.timezone),
          parkId: auth.park.id,
          createdById: auth.user.id,
          ticketTypes: { create: valores.ticketTypeIds.map((ticketTypeId) => ({ ticketTypeId })) },
        },
      });
      await recordAudit(tx, {
        action: 'coupons.created',
        parkId: auth.park.id,
        actorUserId: auth.user.id,
        entityType: 'coupon',
        entityId: criado.id,
        after: valores,
        meta,
      });
      return criado.id;
    });
    return getCouponAdmin(auth, id, db);
  } catch (erro) {
    if (isUniqueViolation(erro)) throw codigoRepetido(valores.code);
    throw erro;
  }
}

export async function updateCoupon(
  auth: AuthContext,
  id: string,
  input: CouponInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminCouponDetail> {
  requirePermission(auth, 'coupons.manage');
  const parsed = couponInputSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const valores = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const atual = await tx.coupon.findFirst({
        where: { id, parkId: auth.park.id },
        include: { ticketTypes: { select: { ticketTypeId: true } } },
      });
      if (!atual) throw Errors.notFound('Cupom não encontrado.');
      await conferirTipos(tx, auth.park.id, valores.ticketTypeIds);
      await tx.coupon.update({
        where: { id },
        data: {
          ...dadosDoCupom(valores, auth.park.timezone),
          ticketTypes: {
            deleteMany: {},
            create: valores.ticketTypeIds.map((ticketTypeId) => ({ ticketTypeId })),
          },
        },
      });
      await recordAudit(tx, {
        action: 'coupons.updated',
        parkId: auth.park.id,
        actorUserId: auth.user.id,
        entityType: 'coupon',
        entityId: id,
        before: { ...toCouponDefinition(atual), code: atual.code },
        after: valores,
        meta,
      });
    });
    return getCouponAdmin(auth, id, db);
  } catch (erro) {
    if (isUniqueViolation(erro)) throw codigoRepetido(valores.code);
    throw erro;
  }
}

export async function setCouponActive(
  auth: AuthContext,
  id: string,
  isActive: boolean,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<AdminCouponDetail> {
  requirePermission(auth, 'coupons.manage');
  await db.$transaction(async (tx) => {
    const atual = await tx.coupon.findFirst({
      where: { id, parkId: auth.park.id },
      select: { isActive: true },
    });
    if (!atual) throw Errors.notFound('Cupom não encontrado.');
    if (atual.isActive === isActive) return;
    await tx.coupon.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, {
      action: isActive ? 'coupons.activated' : 'coupons.deactivated',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'coupon',
      entityId: id,
      meta,
    });
  });
  return getCouponAdmin(auth, id, db);
}

export async function deleteCoupon(
  auth: AuthContext,
  id: string,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<void> {
  requirePermission(auth, 'coupons.manage');
  await db.$transaction(async (tx) => {
    const atual = await tx.coupon.findFirst({ where: { id, parkId: auth.park.id }, select: { code: true } });
    if (!atual) throw Errors.notFound('Cupom não encontrado.');
    const usos = await tx.couponUsage.count({ where: { couponId: id } });
    if (usos > 0) {
      throw new AppError(
        'CONFLICT',
        'Este cupom já foi usado e fica no histórico dos pedidos. Desative-o em vez de excluir.',
      );
    }
    await tx.coupon.delete({ where: { id } });
    await recordAudit(tx, {
      action: 'coupons.deleted',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'coupon',
      entityId: id,
      before: { code: atual.code },
      meta,
    });
  });
}

// ─── Aplicação na compra ────────────────────────────────────────────────────

export interface CouponApplication {
  couponId: string;
  code: string;
  summary: string;
  discountCents: number;
  /** `null`: vale para todos os tipos de ingresso. */
  eligibleTicketTypeIds: readonly string[] | null;
}

/**
 * Confere o cupom para uma compra e calcula o desconto. Com `lock`, trava o
 * cupom até o fim da transação: o uso deve ser gravado na mesma transação.
 */
export async function evaluateCouponForOrder(
  db: DbClient,
  input: {
    parkId: string;
    code: string;
    now: Date;
    visitDate: DateOnly;
    channel: CouponChannel;
    items: readonly { ticketTypeId: string; totalCents: number }[];
    customerId: string | null;
    cpfHash: string | null;
    lock: boolean;
  },
): Promise<CouponApplication> {
  const codigo = input.code.trim().toUpperCase();
  const cupom = await db.coupon.findUnique({
    where: { parkId_code: { parkId: input.parkId, code: codigo } },
    include: { ticketTypes: { select: { ticketTypeId: true } } },
  });
  if (!cupom) {
    throw new AppError('COUPON_INVALID', 'Cupom não encontrado. Confira o código.', {
      details: { reason: 'NOT_FOUND' },
    });
  }
  if (input.lock) await db.$queryRaw`SELECT id FROM coupons WHERE id = ${cupom.id}::uuid FOR UPDATE`;

  const [usos] = await db.$queryRaw<{ total: number; customer: number }[]>`
    SELECT
      COUNT(*) FILTER (
        WHERE u.status = 'CONFIRMED'
          OR (u.status = 'RESERVED' AND o.status = 'PENDING_PAYMENT' AND o.expires_at > now())
      )::int AS total,
      COUNT(*) FILTER (
        WHERE u.cpf_hash = ${input.cpfHash}::text
          AND (u.status = 'CONFIRMED'
            OR (u.status = 'RESERVED' AND o.status = 'PENDING_PAYMENT' AND o.expires_at > now()))
      )::int AS customer
    FROM coupon_usages u
    JOIN orders o ON o.id = u.order_id
    WHERE u.coupon_id = ${cupom.id}::uuid`;

  let jaComprou = false;
  if (input.customerId) {
    const [linha] = await db.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM orders
        WHERE customer_id = ${input.customerId}::uuid
          AND (status = 'CONFIRMED' OR (status = 'PENDING_PAYMENT' AND expires_at > now()))
      ) AS existe`;
    jaComprou = linha?.existe ?? false;
  }

  const avaliacao = evaluateCoupon(toCouponDefinition(cupom), {
    now: input.now,
    visitDate: input.visitDate,
    channel: input.channel,
    items: input.items,
    totalUses: usos?.total ?? 0,
    customerUses: input.cpfHash ? (usos?.customer ?? 0) : null,
    customerHasPurchased: input.cpfHash ? jaComprou : null,
  });
  if (!avaliacao.ok) {
    throw new AppError('COUPON_INVALID', couponRejectionMessage(avaliacao.reason, cupom), {
      details: { reason: avaliacao.reason },
    });
  }

  return {
    couponId: cupom.id,
    code: cupom.code,
    summary: describeCouponDiscount(cupom),
    discountCents: avaliacao.discountCents,
    eligibleTicketTypeIds:
      cupom.ticketTypes.length > 0 ? cupom.ticketTypes.map((tipo) => tipo.ticketTypeId) : null,
  };
}
