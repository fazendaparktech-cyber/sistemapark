import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import {
  addDays,
  dateOnlyToDb,
  dbToDateOnly,
  diffDays,
  isDateOnly,
  isTimeOfDay,
  weekdayOf,
  type DateOnly,
} from '@/lib/dates';
import { MAX_CENTS } from '@/lib/money';
import { DAY_KINDS, dayKindOf, MANUAL_DAY_KINDS, resolvePrice, type DayKind } from '@/lib/pricing';
import { uuidSchema, z } from '@/lib/validation';

import { recordAudit } from '../audit';
import { requirePermission, type AuthContext } from '../auth/context';
import { lotSalesByRule, toPriceRule } from '../catalog/service';
import { prisma, type DbClient } from '../db';
import { AppError, Errors, fromZodError } from '../errors';
import type { RequestMeta } from '../request';

/**
 * Calendário do parque: dias abertos, horários, lotação e tipo do dia (para o
 * preço). Dia sem cadastro está fechado para venda.
 */

export const MAX_CALENDAR_RANGE_DAYS = 400;

export interface DayOccupancy {
  /** Pessoas com ingresso confirmado (ativos e já utilizados). */
  sold: number;
  /** Pessoas seguradas em carrinhos e pedidos aguardando pagamento. */
  held: number;
}

/** Ocupação por dia. Reserva vencida não conta, mesmo antes da limpeza. */
export async function occupancyByDay(
  db: DbClient,
  parkId: string,
  from: DateOnly,
  to: DateOnly,
): Promise<Map<DateOnly, DayOccupancy>> {
  const linhas = await db.$queryRaw<{ date: Date; sold: number; held: number }[]>`
    SELECT
      d.date,
      (SELECT COUNT(*) FROM tickets t
        WHERE t.park_day_id = d.id AND t.status IN ('ACTIVE', 'CHECKED_IN') AND t.occupies_capacity)::int AS sold,
      COALESCE((SELECT SUM(h.people) FROM capacity_holds h
        WHERE h.park_day_id = d.id AND h.status = 'ACTIVE' AND h.expires_at > now()), 0)::int AS held
    FROM park_days d
    WHERE d.park_id = ${parkId}::uuid AND d.date BETWEEN ${from}::date AND ${to}::date`;
  return new Map(linhas.map((linha) => [dbToDateOnly(linha.date), { sold: linha.sold, held: linha.held }]));
}

export interface CalendarDay {
  date: DateOnly;
  configured: boolean;
  status: 'OPEN' | 'CLOSED' | null;
  opensAt: string | null;
  closesAt: string | null;
  capacity: number | null;
  dayKind: DayKind;
  dayKindOverride: DayKind | null;
  label: string | null;
  notes: string | null;
  sold: number;
  held: number;
  /** Vagas livres; `null` quando o dia não está aberto. */
  available: number | null;
}

export async function getCalendarRange(
  parkId: string,
  from: DateOnly,
  to: DateOnly,
  db: DbClient = prisma,
): Promise<CalendarDay[]> {
  const total = diffDays(from, to);
  if (total < 0 || total > MAX_CALENDAR_RANGE_DAYS) throw Errors.badRequest('Intervalo de datas inválido.');

  const [dias, ocupacao] = await Promise.all([
    db.parkDay.findMany({ where: { parkId, date: { gte: dateOnlyToDb(from), lte: dateOnlyToDb(to) } } }),
    occupancyByDay(db, parkId, from, to),
  ]);
  const porData = new Map(dias.map((dia) => [dbToDateOnly(dia.date), dia]));

  const resultado: CalendarDay[] = [];
  for (let i = 0; i <= total; i++) {
    const data = addDays(from, i);
    const dia = porData.get(data);
    const { sold, held } = ocupacao.get(data) ?? { sold: 0, held: 0 };
    resultado.push({
      date: data,
      configured: Boolean(dia),
      status: dia?.status ?? null,
      opensAt: dia?.opensAt ?? null,
      closesAt: dia?.closesAt ?? null,
      capacity: dia?.capacity ?? null,
      dayKind: dayKindOf(data, dia?.dayKind ?? null),
      dayKindOverride: dia?.dayKind ?? null,
      label: dia?.label ?? null,
      notes: dia?.notes ?? null,
      sold,
      held,
      available: dia && dia.status === 'OPEN' ? Math.max(0, dia.capacity - sold - held) : null,
    });
  }
  return resultado;
}

// ─── Alterações ─────────────────────────────────────────────────────────────

const horario = z
  .string()
  .nullish()
  .transform((valor) => (valor ? valor : null))
  .refine((valor) => valor === null || isTimeOfDay(valor), 'Use o formato HH:MM');

const data = z.string().refine(isDateOnly, 'Data inválida');

function conferirHorarios(
  valores: { opensAt: string | null; closesAt: string | null },
  ctx: z.RefinementCtx,
): void {
  if (valores.opensAt && valores.closesAt && valores.opensAt >= valores.closesAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['closesAt'],
      message: 'O fechamento precisa ser depois da abertura',
    });
  }
}

export const calendarPeriodSchema = z
  .strictObject({
    from: data,
    to: data,
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Escolha ao menos um dia da semana')
      .transform((dias) => [...new Set(dias)].sort()),
    status: z.enum(['OPEN', 'CLOSED']),
    opensAt: horario,
    closesAt: horario,
    capacity: z.number().int().min(0, 'A lotação não pode ser negativa').max(100_000, 'Lotação muito alta'),
    overwrite: z.boolean(),
  })
  .superRefine((valores, ctx) => {
    conferirHorarios(valores, ctx);
    if (valores.from > valores.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'A data final precisa ser igual ou depois da inicial',
      });
    } else if (diffDays(valores.from, valores.to) > MAX_CALENDAR_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Use um período de até ${MAX_CALENDAR_RANGE_DAYS} dias`,
      });
    }
  });

export type CalendarPeriodInput = z.input<typeof calendarPeriodSchema>;

export interface CalendarPeriodResult {
  created: number;
  updated: number;
  skipped: number;
  conflicts: { date: DateOnly; reason: string }[];
}

function motivoDeConflito(
  novo: { status: 'OPEN' | 'CLOSED'; capacity: number },
  ocupacao: DayOccupancy,
): string | null {
  const ocupadas = ocupacao.sold + ocupacao.held;
  if (novo.status === 'CLOSED' && ocupadas > 0) {
    return `${ocupadas} ${ocupadas === 1 ? 'pessoa já tem' : 'pessoas já têm'} ingresso ou reserva para este dia.`;
  }
  if (novo.status === 'OPEN' && novo.capacity < ocupadas) {
    return `A lotação não pode ficar abaixo das ${ocupadas} vagas já vendidas ou reservadas.`;
  }
  return null;
}

/** Abre ou fecha um período, nos dias da semana escolhidos. */
export async function applyCalendarPeriod(
  auth: AuthContext,
  input: CalendarPeriodInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<CalendarPeriodResult> {
  requirePermission(auth, 'calendar.manage');
  const parsed = calendarPeriodSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const periodo = parsed.data;

  return db.$transaction(
    async (tx) => {
      const existentes = await tx.parkDay.findMany({
        where: {
          parkId: auth.park.id,
          date: { gte: dateOnlyToDb(periodo.from), lte: dateOnlyToDb(periodo.to) },
        },
      });
      const porData = new Map(existentes.map((dia) => [dbToDateOnly(dia.date), dia]));
      const ocupacao = await occupancyByDay(tx, auth.park.id, periodo.from, periodo.to);
      const resultado: CalendarPeriodResult = { created: 0, updated: 0, skipped: 0, conflicts: [] };

      const total = diffDays(periodo.from, periodo.to);
      for (let i = 0; i <= total; i++) {
        const dia = addDays(periodo.from, i);
        if (!periodo.weekdays.includes(weekdayOf(dia))) continue;
        const existente = porData.get(dia);
        const dados = {
          status: periodo.status,
          opensAt: periodo.status === 'OPEN' ? periodo.opensAt : null,
          closesAt: periodo.status === 'OPEN' ? periodo.closesAt : null,
          capacity: periodo.capacity,
        };

        if (existente && !periodo.overwrite) {
          resultado.skipped += 1;
          continue;
        }
        if (existente) {
          const conflito = motivoDeConflito(dados, ocupacao.get(dia) ?? { sold: 0, held: 0 });
          if (conflito) {
            resultado.conflicts.push({ date: dia, reason: conflito });
            continue;
          }
          await tx.parkDay.update({ where: { id: existente.id }, data: dados });
          resultado.updated += 1;
        } else {
          await tx.parkDay.create({ data: { parkId: auth.park.id, date: dateOnlyToDb(dia), ...dados } });
          resultado.created += 1;
        }
      }

      await recordAudit(tx, {
        action: 'calendar.period_applied',
        parkId: auth.park.id,
        actorUserId: auth.user.id,
        entityType: 'calendar',
        entityId: `${periodo.from}..${periodo.to}`,
        after: {
          weekdays: periodo.weekdays,
          status: periodo.status,
          opensAt: periodo.opensAt,
          closesAt: periodo.closesAt,
          capacity: periodo.capacity,
          overwrite: periodo.overwrite,
        },
        data: {
          created: resultado.created,
          updated: resultado.updated,
          skipped: resultado.skipped,
          conflicts: resultado.conflicts.length,
        },
        meta,
      });
      return resultado;
    },
    { timeout: 20_000 },
  );
}

export const calendarDaySchema = z
  .strictObject({
    status: z.enum(['OPEN', 'CLOSED']),
    opensAt: horario,
    closesAt: horario,
    capacity: z.number().int().min(0, 'A lotação não pode ser negativa').max(100_000, 'Lotação muito alta'),
    dayKind: z
      .enum(DAY_KINDS)
      .nullable()
      .refine((valor) => valor === null || MANUAL_DAY_KINDS.includes(valor), 'Tipo de dia inválido'),
    label: z
      .string()
      .trim()
      .max(80, 'Use no máximo 80 caracteres')
      .nullish()
      .transform((valor) => (valor ? valor : null)),
    notes: z
      .string()
      .trim()
      .max(500, 'Use no máximo 500 caracteres')
      .nullish()
      .transform((valor) => (valor ? valor : null)),
  })
  .superRefine(conferirHorarios);

export type CalendarDayInput = z.input<typeof calendarDaySchema>;

/** Cria ou altera um dia. Protege vendas já feitas: não fecha nem reduz abaixo do vendido. */
export async function saveCalendarDay(
  auth: AuthContext,
  date: DateOnly,
  input: CalendarDayInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<CalendarDay> {
  requirePermission(auth, 'calendar.manage');
  if (!isDateOnly(date)) throw Errors.badRequest('Data inválida.');
  const parsed = calendarDaySchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const valores = parsed.data;

  await db.$transaction(async (tx) => {
    const existente = await tx.parkDay.findUnique({
      where: { parkId_date: { parkId: auth.park.id, date: dateOnlyToDb(date) } },
    });
    if (existente) {
      // Trava o dia: ninguém compra no meio da alteração.
      await tx.$queryRaw`SELECT id FROM park_days WHERE id = ${existente.id}::uuid FOR UPDATE`;
      const ocupacao = (await occupancyByDay(tx, auth.park.id, date, date)).get(date) ?? { sold: 0, held: 0 };
      const conflito = motivoDeConflito(valores, ocupacao);
      if (conflito) throw new AppError('CONFLICT', conflito);
    }

    const dados = {
      status: valores.status,
      opensAt: valores.status === 'OPEN' ? valores.opensAt : null,
      closesAt: valores.status === 'OPEN' ? valores.closesAt : null,
      capacity: valores.capacity,
      dayKind: valores.dayKind,
      label: valores.label,
      notes: valores.notes,
    };
    const salvo = existente
      ? await tx.parkDay.update({ where: { id: existente.id }, data: dados })
      : await tx.parkDay.create({ data: { parkId: auth.park.id, date: dateOnlyToDb(date), ...dados } });

    await recordAudit(tx, {
      action: existente ? 'calendar.day_updated' : 'calendar.day_created',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'park_day',
      entityId: date,
      before: existente
        ? {
            status: existente.status,
            opensAt: existente.opensAt,
            closesAt: existente.closesAt,
            capacity: existente.capacity,
            dayKind: existente.dayKind,
            label: existente.label,
          }
        : undefined,
      after: {
        status: salvo.status,
        opensAt: salvo.opensAt,
        closesAt: salvo.closesAt,
        capacity: salvo.capacity,
        dayKind: salvo.dayKind,
        label: salvo.label,
      },
      meta,
    });
  });

  const [dia] = await getCalendarRange(auth.park.id, date, date, db);
  if (!dia) throw Errors.notFound('Dia não encontrado.');
  return dia;
}

// ─── Preço especial do dia ──────────────────────────────────────────────────

/** Preço especial de uma data vence qualquer outra regra de preço. */
const PRIORIDADE_DO_PRECO_ESPECIAL = 1000;
const NOME_DO_PRECO_ESPECIAL = 'Preço especial do dia';

export interface DayTicketPrice {
  ticketTypeId: string;
  name: string;
  basePriceCents: number;
  /** Preço que vale na data, considerando todas as regras (inclusive a especial). */
  currentPriceCents: number;
  currentLabel: string | null;
  /** Preço especial só desta data; `null` quando não há. */
  specialPriceCents: number | null;
}

export async function getDayPricing(
  auth: AuthContext,
  date: DateOnly,
  db: DbClient = prisma,
  now: Date = new Date(),
): Promise<DayTicketPrice[]> {
  requirePermission(auth, 'calendar.view');
  if (!isDateOnly(date)) throw Errors.badRequest('Data inválida.');
  const noBanco = dateOnlyToDb(date);

  const [dia, tipos] = await Promise.all([
    db.parkDay.findUnique({
      where: { parkId_date: { parkId: auth.park.id, date: noBanco } },
      select: { dayKind: true },
    }),
    db.ticketType.findMany({
      where: { parkId: auth.park.id, isActive: true },
      include: { prices: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);
  const vendidosPorLote = await lotSalesByRule(
    db,
    tipos.flatMap((tipo) =>
      tipo.prices.filter((preco) => preco.lotQuantity !== null).map((preco) => preco.id),
    ),
  );

  return tipos.map((tipo) => {
    const vale = resolvePrice({
      basePriceCents: tipo.basePriceCents,
      rules: tipo.prices.map(toPriceRule),
      visitDate: date,
      dayKindOverride: dia?.dayKind ?? null,
      now,
      soldByRule: vendidosPorLote,
    });
    const especial = tipo.prices.find(
      (preco) =>
        preco.kind === 'SPECIAL_DATE' &&
        preco.visitFrom?.getTime() === noBanco.getTime() &&
        preco.visitUntil?.getTime() === noBanco.getTime(),
    );
    return {
      ticketTypeId: tipo.id,
      name: tipo.name,
      basePriceCents: tipo.basePriceCents,
      currentPriceCents: vale.priceCents,
      currentLabel: vale.label,
      specialPriceCents: especial?.priceCents ?? null,
    };
  });
}

export const daySpecialPricesSchema = z.strictObject({
  prices: z
    .array(
      z.strictObject({
        ticketTypeId: uuidSchema,
        priceCents: z.number().int().min(0, 'Preço inválido').max(MAX_CENTS, 'Preço muito alto').nullable(),
      }),
    )
    .max(100),
});

export type DaySpecialPricesInput = z.input<typeof daySpecialPricesSchema>;

/** Define, altera ou remove (valor vazio) o preço especial de cada tipo de ingresso numa data. */
export async function saveDaySpecialPrices(
  auth: AuthContext,
  date: DateOnly,
  input: DaySpecialPricesInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<DayTicketPrice[]> {
  requirePermission(auth, 'calendar.manage');
  if (!isDateOnly(date)) throw Errors.badRequest('Data inválida.');
  const parsed = daySpecialPricesSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const noBanco = dateOnlyToDb(date);
  const ids = [...new Set(parsed.data.prices.map((item) => item.ticketTypeId))];

  await db.$transaction(async (tx) => {
    const tipos = await tx.ticketType.findMany({
      where: { parkId: auth.park.id, id: { in: ids } },
      select: { id: true },
    });
    if (tipos.length !== ids.length) throw Errors.notFound('Tipo de ingresso não encontrado.');
    const existentes = await tx.ticketPrice.findMany({
      where: { ticketTypeId: { in: ids }, kind: 'SPECIAL_DATE', visitFrom: noBanco, visitUntil: noBanco },
    });

    const mudancas: { ticketTypeId: string; before: number | null; after: number | null }[] = [];
    for (const item of parsed.data.prices) {
      const atual = existentes.find((regra) => regra.ticketTypeId === item.ticketTypeId);
      if (item.priceCents === null) {
        if (!atual) continue;
        await tx.ticketPrice.delete({ where: { id: atual.id } });
        mudancas.push({ ticketTypeId: item.ticketTypeId, before: atual.priceCents, after: null });
      } else if (atual) {
        if (atual.priceCents === item.priceCents && atual.isActive) continue;
        await tx.ticketPrice.update({
          where: { id: atual.id },
          data: { priceCents: item.priceCents, compareAtCents: null, isActive: true },
        });
        mudancas.push({ ticketTypeId: item.ticketTypeId, before: atual.priceCents, after: item.priceCents });
      } else {
        await tx.ticketPrice.create({
          data: {
            ticketTypeId: item.ticketTypeId,
            kind: 'SPECIAL_DATE',
            name: NOME_DO_PRECO_ESPECIAL,
            priceCents: item.priceCents,
            dayKinds: [],
            visitFrom: noBanco,
            visitUntil: noBanco,
            priority: PRIORIDADE_DO_PRECO_ESPECIAL,
            isActive: true,
          },
        });
        mudancas.push({ ticketTypeId: item.ticketTypeId, before: null, after: item.priceCents });
      }
    }

    if (mudancas.length > 0) {
      await recordAudit(tx, {
        action: 'calendar.special_prices_updated',
        parkId: auth.park.id,
        actorUserId: auth.user.id,
        entityType: 'park_day',
        entityId: date,
        data: { changes: mudancas },
        meta,
      });
    }
  });
  return getDayPricing(auth, date, db);
}

/** Datas do intervalo que têm preço especial em algum tipo de ingresso. */
export async function specialPriceDates(
  parkId: string,
  from: DateOnly,
  to: DateOnly,
  db: DbClient = prisma,
): Promise<DateOnly[]> {
  const regras = await db.ticketPrice.findMany({
    where: {
      kind: 'SPECIAL_DATE',
      isActive: true,
      ticketType: { parkId },
      visitFrom: { gte: dateOnlyToDb(from), lte: dateOnlyToDb(to) },
    },
    select: { visitFrom: true },
  });
  return [...new Set(regras.flatMap((regra) => (regra.visitFrom ? [dbToDateOnly(regra.visitFrom)] : [])))];
}
