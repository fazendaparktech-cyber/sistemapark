import 'server-only';

import type { CheckinMethod, Prisma, TicketEventType } from '@/generated/prisma/client';
import { dbToDateOnly, todayIn, type DateOnly } from '@/lib/dates';
import { saleStatusOf, type SaleStatusKey } from '@/lib/orders';
import type { CheckinReasonKey } from '@/lib/tickets';

import { can, requirePermission, type AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { Errors } from '../errors';
import { orderPublicUrl } from '../orders/emails';
import { qrCodeSvg } from '../qr';
import { ticketQrPayload } from '../signing';
import {
  TICKET_LIST_SELECT,
  ticketWhere,
  toTicketListItem,
  type TicketFilters,
  type TicketListItem,
} from './search';

/** Ingressos no painel: lista com busca e a ficha de cada ingresso (QR, histórico e tentativas de entrada). */

export const TICKETS_PAGE_SIZE = 25;

export async function listTickets(
  auth: AuthContext,
  filtros: TicketFilters = {},
  db: DbClient = prisma,
): Promise<{ items: TicketListItem[]; total: number; page: number; pageSize: number }> {
  requirePermission(auth, 'tickets.view');
  const hoje = todayIn(auth.park.timezone);
  const where = ticketWhere(auth.park.id, filtros, hoje);
  const pagina = Math.max(1, Math.floor(filtros.page ?? 1));

  const [ingressos, total] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: (pagina - 1) * TICKETS_PAGE_SIZE,
      take: TICKETS_PAGE_SIZE,
      select: TICKET_LIST_SELECT,
    }),
    db.ticket.count({ where }),
  ]);
  return {
    items: ingressos.map((ingresso) => toTicketListItem(ingresso, hoje)),
    total,
    page: pagina,
    pageSize: TICKETS_PAGE_SIZE,
  };
}

export interface TicketDetail extends TicketListItem {
  holderBirthDate: DateOnly | null;
  occupiesCapacity: boolean;
  createdAt: Date;
  activatedAt: Date | null;
  cancelledAt: Date | null;
  /** QR Code só enquanto o ingresso pode entrar. */
  qrSvg: string | null;
  customer: { id: string; name: string } | null;
  order: {
    id: string;
    code: string;
    saleStatus: SaleStatusKey;
    totalCents: number;
    buyerEmail: string | null;
  };
  events: {
    id: string;
    type: TicketEventType;
    at: Date;
    actorName: string | null;
    data: Prisma.JsonValue | null;
  }[];
  attempts: {
    id: string;
    at: Date;
    allowed: boolean;
    reason: CheckinReasonKey | null;
    method: CheckinMethod;
    operatorName: string | null;
    device: string | null;
  }[];
  publicUrl: string | null;
}

export async function getTicketAdmin(
  auth: AuthContext,
  id: string,
  db: DbClient = prisma,
): Promise<TicketDetail> {
  requirePermission(auth, 'tickets.view');
  const ingresso = await db.ticket.findFirst({
    where: { id, parkId: auth.park.id },
    select: {
      ...TICKET_LIST_SELECT,
      parkId: true,
      qrVersion: true,
      holderBirthDate: true,
      occupiesCapacity: true,
      createdAt: true,
      activatedAt: true,
      cancelledAt: true,
      customer: { select: { id: true, name: true } },
      order: {
        select: {
          id: true,
          code: true,
          buyerName: true,
          buyerPhone: true,
          buyerEmail: true,
          channel: true,
          status: true,
          financialStatus: true,
          expiresAt: true,
          totalCents: true,
          accessVersion: true,
        },
      },
      events: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, type: true, createdAt: true, data: true, actorUser: { select: { name: true } } },
      },
      checkinAttempts: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: {
          id: true,
          createdAt: true,
          result: true,
          reason: true,
          method: true,
          device: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  if (!ingresso) throw Errors.notFound('Ingresso não encontrado.');

  const hoje = todayIn(auth.park.timezone);
  const item = toTicketListItem(ingresso, hoje);
  const podeEntrar = item.status === 'ACTIVE';

  return {
    ...item,
    holderBirthDate: ingresso.holderBirthDate ? dbToDateOnly(ingresso.holderBirthDate) : null,
    occupiesCapacity: ingresso.occupiesCapacity,
    createdAt: ingresso.createdAt,
    activatedAt: ingresso.activatedAt,
    cancelledAt: ingresso.cancelledAt,
    qrSvg: podeEntrar ? await qrCodeSvg(ticketQrPayload(ingresso)) : null,
    customer: ingresso.customer,
    order: {
      id: ingresso.order.id,
      code: ingresso.order.code,
      saleStatus: saleStatusOf(ingresso.order),
      totalCents: ingresso.order.totalCents,
      buyerEmail: ingresso.order.buyerEmail,
    },
    events: ingresso.events.map((evento) => ({
      id: evento.id,
      type: evento.type,
      at: evento.createdAt,
      actorName: evento.actorUser?.name ?? null,
      data: evento.data,
    })),
    attempts: ingresso.checkinAttempts.map((tentativa) => ({
      id: tentativa.id,
      at: tentativa.createdAt,
      allowed: tentativa.result === 'ALLOWED',
      reason: tentativa.reason,
      method: tentativa.method,
      operatorName: tentativa.user?.name ?? null,
      device: tentativa.device,
    })),
    publicUrl: can(auth, 'orders.resend') ? orderPublicUrl(ingresso.order) : null,
  };
}
