import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import { holderRequirements, type HolderDataKey, type TicketCategoryKey } from '@/lib/catalog';
import { dateOnlyToDb, dbToDateOnly, todayIn, type DateOnly } from '@/lib/dates';
import { isValidCpf, onlyDigits } from '@/lib/documents';
import { dateOnlySchema } from '@/lib/person-schemas';
import { uuidSchema, z } from '@/lib/validation';

import { sellableTicketTypes } from '../catalog/service';
import { evaluateCouponForOrder } from '../coupons/service';
import { randomToken, sha256Hex } from '../crypto';
import { prisma, type DbClient, type Tx } from '../db';
import { AppError, fromZodError } from '../errors';
import type { PublicPark } from '../parks/public';
import { enforceRateLimit, rateLimitKey } from '../rate-limit';
import type { RequestMeta } from '../request';
import { getSalesSettings } from '../settings/service';
import { hashCpf } from '../signing';
import { lockParkDayByDate, occupiedPeople, onlineSaleBlocker } from './availability';

/**
 * Carrinho do site: a escolha de data e ingressos, com as vagas seguradas por
 * alguns minutos enquanto a pessoa preenche os dados. O navegador guarda só um
 * token aleatório (cookie httpOnly); no banco fica o hash dele.
 */

export const CART_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-cp_cart' : 'cp_cart';

export const cartSelectionSchema = z.strictObject({
  date: dateOnlySchema,
  items: z
    .array(
      z.strictObject({
        ticketTypeId: uuidSchema,
        quantity: z.number().int().min(0).max(100, 'Quantidade muito alta'),
      }),
    )
    .min(1, 'Escolha pelo menos um ingresso')
    .max(30),
});

export type CartSelectionInput = z.input<typeof cartSelectionSchema>;

export function cartNotFoundError(): AppError {
  return new AppError(
    'CART_NOT_FOUND',
    'Não encontramos sua escolha de ingressos. Escolha a data e os ingressos de novo.',
  );
}

export function cartExpiredError(): AppError {
  return new AppError(
    'CART_EXPIRED',
    'O tempo para concluir a compra acabou e as vagas foram liberadas. Escolha os ingressos de novo.',
  );
}

export interface CartItemView {
  ticketTypeId: string;
  name: string;
  description: string | null;
  category: TicketCategoryKey;
  quantity: number;
  unitPriceCents: number;
  compareAtCents: number | null;
  priceLabel: string | null;
  totalCents: number;
  peoplePerTicket: number;
  /** Ingressos (pessoas) gerados por este item. */
  tickets: number;
  holderData: HolderDataKey;
  holder: { name: boolean; cpf: boolean; birthDate: boolean };
  requiresDocument: boolean;
  documentHint: string | null;
  minAge: number | null;
  maxAge: number | null;
  /** `false` quando o ingresso deixou de ser vendido depois de entrar no carrinho. */
  available: boolean;
}

export interface CartView {
  id: string;
  date: DateOnly;
  expiresAt: Date;
  day: { opensAt: string | null; closesAt: string | null; label: string | null };
  items: CartItemView[];
  subtotalCents: number;
  ticketsCount: number;
  hasUnavailableItems: boolean;
}

async function liberarCarrinho(tx: Tx, parkId: string, token: string): Promise<void> {
  const carrinho = await tx.cart.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: { id: true, parkId: true, status: true },
  });
  if (!carrinho || carrinho.parkId !== parkId || carrinho.status !== 'ACTIVE') return;
  await tx.cart.update({ where: { id: carrinho.id }, data: { status: 'ABANDONED' } });
  await tx.capacityHold.updateMany({
    where: { cartId: carrinho.id, status: 'ACTIVE', orderId: null },
    data: { status: 'RELEASED' },
  });
}

/** Cria o carrinho e segura as vagas. Um carrinho anterior do mesmo navegador é liberado. */
export async function createCart(
  input: {
    park: PublicPark;
    selection: CartSelectionInput;
    previousToken: string | null | undefined;
    meta: RequestMeta;
    now?: Date;
  },
  db: PrismaClient = prisma,
): Promise<{ token: string; cart: CartView }> {
  const parsed = cartSelectionSchema.safeParse(input.selection);
  if (!parsed.success) throw fromZodError(parsed.error);
  const { park } = input;
  const data = parsed.data.date;
  const agora = input.now ?? new Date();

  const porTipo = new Map<string, number>();
  for (const item of parsed.data.items) {
    porTipo.set(item.ticketTypeId, (porTipo.get(item.ticketTypeId) ?? 0) + item.quantity);
  }
  const escolhidos = [...porTipo]
    .filter(([, quantidade]) => quantidade > 0)
    .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
  if (escolhidos.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Escolha pelo menos um ingresso.', {
      details: { fields: { items: 'Escolha pelo menos um ingresso' } },
    });
  }

  const config = await getSalesSettings(park.id, db);
  await enforceRateLimit({ key: rateLimitKey('carrinho', input.meta.ip), limit: 40, windowSeconds: 600 }, db);

  const token = randomToken();
  await db.$transaction(
    async (tx) => {
      const dia = await lockParkDayByDate(tx, park.id, data);
      const bloqueio = onlineSaleBlocker({
        date: data,
        today: todayIn(park.timezone, agora),
        now: agora,
        timeZone: park.timezone,
        settings: config,
        day: dia,
      });
      if (bloqueio || !dia)
        throw new AppError('DATE_UNAVAILABLE', bloqueio ?? 'O parque não abre nesta data.');

      if (input.previousToken) await liberarCarrinho(tx, park.id, input.previousToken);

      const tipos = await sellableTicketTypes(tx, {
        parkId: park.id,
        parkDayId: dia.id,
        date: data,
        dayKindOverride: dia.dayKind,
        channel: 'ONLINE',
        now: agora,
        quantities: new Map(escolhidos.map((item) => [item.ticketTypeId, item.quantity])),
      });
      const porId = new Map(tipos.map((tipo) => [tipo.id, tipo]));

      let pessoas = 0;
      let ingressos = 0;
      for (const item of escolhidos) {
        const tipo = porId.get(item.ticketTypeId);
        if (!tipo) {
          throw new AppError(
            'CONFLICT',
            'Um dos ingressos escolhidos não está à venda para esta data. Atualize a página e escolha de novo.',
          );
        }
        if (tipo.minPerOrder !== null && item.quantity < tipo.minPerOrder) {
          throw new AppError(
            'LIMIT_EXCEEDED',
            `${tipo.name}: compre pelo menos ${tipo.minPerOrder} por pedido.`,
          );
        }
        if (tipo.maxPerOrder !== null && item.quantity > tipo.maxPerOrder) {
          throw new AppError('LIMIT_EXCEEDED', `${tipo.name}: o máximo é ${tipo.maxPerOrder} por pedido.`);
        }
        if (tipo.remainingUnits !== null && item.quantity > tipo.remainingUnits) {
          throw new AppError(
            'SOLD_OUT',
            tipo.remainingUnits === 0
              ? `${tipo.name}: esgotado para esta data.`
              : `${tipo.name}: restam ${tipo.remainingUnits} para esta data.`,
            { details: { ticketTypeId: tipo.id, remaining: tipo.remainingUnits } },
          );
        }
        ingressos += item.quantity * tipo.peoplePerTicket;
        if (tipo.occupiesCapacity) pessoas += item.quantity * tipo.peoplePerTicket;
      }
      if (ingressos > config.maxTicketsPerOrder) {
        throw new AppError(
          'LIMIT_EXCEEDED',
          `Cada pedido pode ter até ${config.maxTicketsPerOrder} ingressos.`,
        );
      }

      const livres = Math.max(0, dia.capacity - (await occupiedPeople(tx, dia.id)));
      if (pessoas > livres) {
        throw new AppError(
          'SOLD_OUT',
          livres === 0
            ? 'Os ingressos para esta data esgotaram.'
            : `Restam ${livres} vagas para esta data. Diminua a quantidade ou escolha outra data.`,
          { details: { available: livres } },
        );
      }

      const expiraEm = new Date(agora.getTime() + config.cartHoldMinutes * 60_000);
      const carrinho = await tx.cart.create({
        data: {
          parkId: park.id,
          parkDayId: dia.id,
          visitDate: dateOnlyToDb(data),
          tokenHash: sha256Hex(token),
          expiresAt: expiraEm,
          ip: input.meta.ip,
          items: { create: escolhidos },
        },
      });
      await tx.capacityHold.create({
        data: {
          parkId: park.id,
          parkDayId: dia.id,
          cartId: carrinho.id,
          people: pessoas,
          expiresAt: expiraEm,
          items: { create: escolhidos },
        },
      });
    },
    { maxWait: 10_000, timeout: 20_000 },
  );

  const cart = await getCartView(park.id, token, db, agora);
  if (!cart) throw cartExpiredError();
  return { token, cart };
}

/** Carrinho ativo e no prazo, com os preços do momento. */
export async function getCartView(
  parkId: string,
  token: string | null | undefined,
  db: DbClient = prisma,
  now: Date = new Date(),
): Promise<CartView | null> {
  if (!token) return null;
  const carrinho = await db.cart.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { parkDay: true, items: { include: { ticketType: true } } },
  });
  if (!carrinho || carrinho.parkId !== parkId || carrinho.status !== 'ACTIVE' || carrinho.expiresAt <= now) {
    return null;
  }

  const data = dbToDateOnly(carrinho.visitDate);
  const tipos = await sellableTicketTypes(db, {
    parkId,
    parkDayId: carrinho.parkDayId,
    date: data,
    dayKindOverride: carrinho.parkDay.dayKind,
    channel: 'ONLINE',
    now,
    quantities: new Map(carrinho.items.map((item) => [item.ticketTypeId, item.quantity])),
  });
  const porId = new Map(tipos.map((tipo) => [tipo.id, tipo]));

  const items = [...carrinho.items]
    .sort(
      (a, b) =>
        a.ticketType.sortOrder - b.ticketType.sortOrder || a.ticketType.name.localeCompare(b.ticketType.name),
    )
    .map((item): CartItemView => {
      const tipo = porId.get(item.ticketTypeId);
      const cadastro = item.ticketType;
      const unitario = tipo?.priceCents ?? 0;
      return {
        ticketTypeId: item.ticketTypeId,
        name: tipo?.name ?? cadastro.name,
        description: cadastro.description,
        category: cadastro.category,
        quantity: item.quantity,
        unitPriceCents: unitario,
        compareAtCents: tipo?.compareAtCents ?? null,
        priceLabel: tipo?.priceLabel ?? null,
        totalCents: unitario * item.quantity,
        peoplePerTicket: cadastro.peoplePerTicket,
        tickets: item.quantity * cadastro.peoplePerTicket,
        holderData: cadastro.holderData,
        holder: holderRequirements(cadastro.holderData),
        requiresDocument: cadastro.requiresDocument,
        documentHint: cadastro.documentHint,
        minAge: cadastro.minAge,
        maxAge: cadastro.maxAge,
        available: Boolean(tipo),
      };
    });

  return {
    id: carrinho.id,
    date: data,
    expiresAt: carrinho.expiresAt,
    day: {
      opensAt: carrinho.parkDay.opensAt,
      closesAt: carrinho.parkDay.closesAt,
      label: carrinho.parkDay.label,
    },
    items,
    subtotalCents: items.filter((item) => item.available).reduce((soma, item) => soma + item.totalCents, 0),
    ticketsCount: items.reduce((soma, item) => soma + item.tickets, 0),
    hasUnavailableItems: items.some((item) => !item.available),
  };
}

/** A pessoa desistiu ou quer mudar a escolha: as vagas voltam na hora. */
export async function releaseCart(
  parkId: string,
  token: string | null | undefined,
  db: PrismaClient = prisma,
): Promise<void> {
  if (!token) return;
  await db.$transaction((tx) => liberarCarrinho(tx, parkId, token));
}

/** Confere um cupom contra o carrinho, sem reservar. A compra confere de novo, com trava. */
export async function previewCartCoupon(
  input: {
    park: PublicPark;
    cartToken: string | null | undefined;
    code: string;
    cpf: string | null;
    meta: RequestMeta;
  },
  db: DbClient = prisma,
): Promise<{
  code: string;
  summary: string;
  discountCents: number;
  subtotalCents: number;
  totalCents: number;
}> {
  await enforceRateLimit({ key: rateLimitKey('cupom', input.meta.ip), limit: 30, windowSeconds: 600 }, db);
  const carrinho = await getCartView(input.park.id, input.cartToken, db);
  if (!carrinho) throw cartExpiredError();

  const digitos = onlyDigits(input.cpf ?? '');
  const cpfHash = isValidCpf(digitos) ? hashCpf(digitos) : null;
  const cliente = cpfHash
    ? await db.customer.findUnique({
        where: { parkId_cpfHash: { parkId: input.park.id, cpfHash } },
        select: { id: true },
      })
    : null;

  const aplicacao = await evaluateCouponForOrder(db, {
    parkId: input.park.id,
    code: input.code,
    now: new Date(),
    visitDate: carrinho.date,
    channel: 'ONLINE',
    items: carrinho.items
      .filter((item) => item.available)
      .map((item) => ({ ticketTypeId: item.ticketTypeId, totalCents: item.totalCents })),
    customerId: cliente?.id ?? null,
    cpfHash,
    lock: false,
  });

  return {
    code: aplicacao.code,
    summary: aplicacao.summary,
    discountCents: aplicacao.discountCents,
    subtotalCents: carrinho.subtotalCents,
    totalCents: carrinho.subtotalCents - aplicacao.discountCents,
  };
}
