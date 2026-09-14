import 'server-only';

import type { CheckinMethod, CheckinReason, PrismaClient } from '@/generated/prisma/client';
import {
  dbToDateOnly,
  formatDateBR,
  formatTimeBR,
  todayIn,
  zonedTimeToInstant,
  type DateOnly,
} from '@/lib/dates';
import {
  CHECKIN_REASON_LABELS,
  checkinManualSchema,
  checkinScanSchema,
  type CheckinManualInput,
  type CheckinReasonKey,
  type CheckinScanInput,
} from '@/lib/tickets';

import { requirePermission, type AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { Errors, fromZodError } from '../errors';
import { notify } from '../notifications/service';
import type { RequestMeta } from '../request';
import { isTicketQrSignatureValid, parseTicketQr } from '../signing';
import { TICKET_LIST_SELECT, ticketWhere, toTicketListItem, type TicketListItem } from '../tickets/search';

/**
 * Portaria. Cada leitura trava o ingresso até registrar o resultado: duas
 * leituras simultâneas do mesmo QR liberam uma entrada só. Toda tentativa,
 * liberada ou negada, fica registrada com o motivo, quem operou e o aparelho.
 */

export interface CheckinTicketInfo {
  id: string;
  code: string;
  holderName: string | null;
  buyerName: string;
  typeName: string;
  visitDate: DateOnly;
  orderId: string;
  orderCode: string;
  checkedInAt: Date | null;
  checkedInByName: string | null;
}

export interface CheckinResult {
  allowed: boolean;
  reason: CheckinReasonKey | null;
  /** "Entrada liberada" ou o motivo da recusa. */
  title: string;
  /** Detalhe para a equipe: quando já foi usado, para qual data é o ingresso etc. */
  detail: string | null;
  ticket: CheckinTicketInfo | null;
  at: Date;
}

const SELECAO_DA_ENTRADA = {
  id: true,
  parkId: true,
  code: true,
  status: true,
  visitDate: true,
  holderName: true,
  checkedInAt: true,
  ticketType: { select: { name: true } },
  checkedInBy: { select: { name: true } },
  order: { select: { id: true, code: true, buyerName: true } },
} as const;

/** Um aviso por ingresso a cada 10 minutos, mesmo que a pessoa insista várias vezes. */
const JANELA_DO_AVISO_MS = 10 * 60_000;

function detalheDaRecusa(
  motivo: CheckinReason,
  ingresso: { visitDate: DateOnly; checkedInAt: Date | null; checkedInByName: string | null } | null,
  fuso: string,
  hoje: DateOnly,
): string | null {
  if (!ingresso) {
    return motivo === 'INVALID_QR'
      ? 'O código lido não é um ingresso deste parque. Peça o QR Code enviado por e-mail ou WhatsApp.'
      : 'Nenhum ingresso com este código. Confira na busca pelo nome ou CPF.';
  }
  switch (motivo) {
    case 'ALREADY_USED': {
      if (!ingresso.checkedInAt) return 'A entrada deste ingresso já foi registrada.';
      const quando =
        dbDia(ingresso.checkedInAt, fuso) === hoje
          ? `hoje às ${formatTimeBR(ingresso.checkedInAt, fuso)}`
          : `em ${formatDateBR(dbDia(ingresso.checkedInAt, fuso))} às ${formatTimeBR(ingresso.checkedInAt, fuso)}`;
      return `Entrada registrada ${quando}.`;
    }
    case 'WRONG_DATE':
      return `Este ingresso é para ${formatDateBR(ingresso.visitDate)}.`;
    case 'EXPIRED':
      return `Ingresso para ${formatDateBR(ingresso.visitDate)}, data que já passou.`;
    case 'PENDING_PAYMENT':
      return 'O pagamento deste pedido ainda não foi confirmado.';
    case 'CANCELLED':
      return 'O pedido foi cancelado e o ingresso não vale mais.';
    case 'REFUNDED':
      return 'O valor foi devolvido ao cliente e o ingresso não vale mais.';
    default:
      return null;
  }
}

function dbDia(instante: Date, fuso: string): DateOnly {
  return todayIn(fuso, instante);
}

async function registrarRecusaSemIngresso(
  db: DbClient,
  auth: AuthContext,
  entrada: {
    reason: CheckinReason;
    codeTried: string | null;
    ticketId: string | null;
    method: CheckinMethod;
  },
  meta: RequestMeta,
  device: string | null,
): Promise<CheckinResult> {
  const agora = new Date();
  await db.checkinAttempt.create({
    data: {
      parkId: auth.park.id,
      ticketId: entrada.ticketId,
      userId: auth.user.id,
      method: entrada.method,
      result: 'DENIED',
      reason: entrada.reason,
      codeTried: entrada.codeTried?.slice(0, 40) ?? null,
      device,
      ip: meta.ip,
    },
  });
  return {
    allowed: false,
    reason: entrada.reason,
    title: CHECKIN_REASON_LABELS[entrada.reason],
    detail: detalheDaRecusa(entrada.reason, null, auth.park.timezone, todayIn(auth.park.timezone, agora)),
    ticket: null,
    at: agora,
  };
}

async function tentarEntrada(
  db: PrismaClient,
  auth: AuthContext,
  ticketId: string,
  method: CheckinMethod,
  meta: RequestMeta,
  device: string | null,
): Promise<CheckinResult> {
  const fuso = auth.park.timezone;
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`;
      const ingresso = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: SELECAO_DA_ENTRADA,
      });
      const agora = new Date();
      const hoje = todayIn(fuso, agora);
      const visitDate = dbToDateOnly(ingresso.visitDate);

      let motivo: CheckinReason | null = null;
      if (ingresso.status === 'CHECKED_IN') motivo = 'ALREADY_USED';
      else if (ingresso.status === 'CANCELLED') motivo = 'CANCELLED';
      else if (ingresso.status === 'REFUNDED') motivo = 'REFUNDED';
      else if (ingresso.status === 'EXPIRED' || visitDate < hoje) motivo = 'EXPIRED';
      else if (ingresso.status === 'PENDING_PAYMENT') motivo = 'PENDING_PAYMENT';
      else if (visitDate > hoje) motivo = 'WRONG_DATE';

      if (motivo === null) {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: 'CHECKED_IN', checkedInAt: agora, checkedInById: auth.user.id },
        });
        await tx.ticketEvent.create({
          data: { ticketId, type: 'CHECKED_IN', actorUserId: auth.user.id, data: { method, device } },
        });
      }
      await tx.checkinAttempt.create({
        data: {
          parkId: auth.park.id,
          ticketId,
          userId: auth.user.id,
          method,
          result: motivo ? 'DENIED' : 'ALLOWED',
          reason: motivo,
          codeTried: ingresso.code,
          device,
          ip: meta.ip,
        },
      });

      const info: CheckinTicketInfo = {
        id: ingresso.id,
        code: ingresso.code,
        holderName: ingresso.holderName,
        buyerName: ingresso.order.buyerName,
        typeName: ingresso.ticketType.name,
        visitDate,
        orderId: ingresso.order.id,
        orderCode: ingresso.order.code,
        checkedInAt: motivo === null ? agora : ingresso.checkedInAt,
        checkedInByName: motivo === null ? auth.user.name : (ingresso.checkedInBy?.name ?? null),
      };

      if (motivo === 'ALREADY_USED') {
        const pessoa = ingresso.holderName ?? ingresso.order.buyerName;
        await notify(tx, {
          parkId: auth.park.id,
          type: 'DUPLICATE_CHECKIN',
          severity: 'WARNING',
          title: 'Ingresso já utilizado apresentado de novo',
          body: `Ingresso ${ingresso.code} (${pessoa}) tentou entrar às ${formatTimeBR(agora, fuso)}. ${
            detalheDaRecusa(motivo, info, fuso, hoje) ?? ''
          }`.trim(),
          href: `/admin/ingressos/${ingresso.id}`,
          permission: 'checkin.monitor',
          dedupeKey: `ingresso-duplicado:${ingresso.id}:${Math.floor(agora.getTime() / JANELA_DO_AVISO_MS)}`,
        });
      }

      return {
        allowed: motivo === null,
        reason: motivo,
        title: motivo ? CHECKIN_REASON_LABELS[motivo] : 'Entrada liberada',
        detail: motivo ? detalheDaRecusa(motivo, info, fuso, hoje) : null,
        ticket: info,
        at: agora,
      };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/** Leitura do QR Code pela câmera. */
export async function checkInByQr(
  auth: AuthContext,
  input: CheckinScanInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<CheckinResult> {
  requirePermission(auth, 'checkin.scan');
  const parsed = checkinScanSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const { payload, device } = parsed.data;

  const lido = parseTicketQr(payload);
  if (!lido) {
    return registrarRecusaSemIngresso(
      db,
      auth,
      { reason: 'INVALID_QR', codeTried: payload, ticketId: null, method: 'QR' },
      meta,
      device,
    );
  }
  const ingresso = await db.ticket.findUnique({
    where: { parkId_code: { parkId: auth.park.id, code: lido.code } },
    select: { id: true, parkId: true, code: true, qrVersion: true },
  });
  if (!ingresso) {
    return registrarRecusaSemIngresso(
      db,
      auth,
      { reason: 'NOT_FOUND', codeTried: lido.code, ticketId: null, method: 'QR' },
      meta,
      device,
    );
  }
  if (!isTicketQrSignatureValid(ingresso, lido.signature)) {
    // Código real com assinatura errada: cópia adulterada ou QR de uma versão antiga.
    return registrarRecusaSemIngresso(
      db,
      auth,
      { reason: 'INVALID_QR', codeTried: lido.code, ticketId: ingresso.id, method: 'QR' },
      meta,
      device,
    );
  }
  return tentarEntrada(db, auth, ingresso.id, 'QR', meta, device);
}

/** Liberação pela busca (cliente sem celular, QR ilegível). */
export async function checkInManually(
  auth: AuthContext,
  input: CheckinManualInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<CheckinResult> {
  requirePermission(auth, 'checkin.manual');
  const parsed = checkinManualSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const ingresso = await db.ticket.findFirst({
    where: { id: parsed.data.ticketId, parkId: auth.park.id },
    select: { id: true },
  });
  if (!ingresso) throw Errors.notFound('Ingresso não encontrado.');
  return tentarEntrada(db, auth, ingresso.id, 'MANUAL', meta, parsed.data.device);
}

/** Busca da portaria: ingressos de hoje primeiro. */
export async function searchCheckinTickets(
  auth: AuthContext,
  q: string,
  db: DbClient = prisma,
): Promise<TicketListItem[]> {
  requirePermission(auth, 'checkin.manual');
  const termo = q.trim().slice(0, 100);
  if (termo.length < 3) return [];
  const hoje = todayIn(auth.park.timezone);
  const ingressos = await db.ticket.findMany({
    where: ticketWhere(auth.park.id, { q: termo }, hoje),
    orderBy: [{ visitDate: 'desc' }, { holderName: 'asc' }, { code: 'asc' }],
    take: 40,
    select: TICKET_LIST_SELECT,
  });
  return ingressos
    .map((ingresso) => toTicketListItem(ingresso, hoje))
    .sort((a, b) => Number(b.visitDate === hoje) - Number(a.visitDate === hoje));
}

export interface CheckinDaySummary {
  date: DateOnly;
  capacity: number | null;
  /** Ingressos válidos para hoje (já usados ou não). */
  expected: number;
  checkedIn: number;
  remaining: number;
  deniedToday: number;
  recent: {
    id: string;
    at: Date;
    allowed: boolean;
    reason: CheckinReasonKey | null;
    method: CheckinMethod;
    code: string | null;
    personName: string | null;
    typeName: string | null;
    operatorName: string | null;
  }[];
}

export async function getCheckinSummary(
  auth: AuthContext,
  db: DbClient = prisma,
): Promise<CheckinDaySummary> {
  requirePermission(auth, 'checkin.monitor');
  const parkId = auth.park.id;
  const hoje = todayIn(auth.park.timezone);
  const inicio = zonedTimeToInstant(hoje, '00:00', auth.park.timezone);

  const [contagem, dia, negadas, recentes] = await Promise.all([
    db.$queryRaw<{ expected: number; checked_in: number }[]>`
      SELECT COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'CHECKED_IN'))::int AS expected,
        COUNT(*) FILTER (WHERE status = 'CHECKED_IN')::int AS checked_in
      FROM tickets
      WHERE park_id = ${parkId}::uuid AND visit_date = ${hoje}::date`,
    db.parkDay.findFirst({
      where: { parkId, date: new Date(`${hoje}T00:00:00.000Z`) },
      select: { capacity: true, status: true },
    }),
    db.checkinAttempt.count({ where: { parkId, result: 'DENIED', createdAt: { gte: inicio } } }),
    db.checkinAttempt.findMany({
      where: { parkId, createdAt: { gte: inicio } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 15,
      select: {
        id: true,
        createdAt: true,
        result: true,
        reason: true,
        method: true,
        codeTried: true,
        user: { select: { name: true } },
        ticket: {
          select: {
            code: true,
            holderName: true,
            ticketType: { select: { name: true } },
            order: { select: { buyerName: true } },
          },
        },
      },
    }),
  ]);
  const esperados = contagem[0]?.expected ?? 0;
  const entraram = contagem[0]?.checked_in ?? 0;

  return {
    date: hoje,
    capacity: dia?.status === 'OPEN' ? dia.capacity : null,
    expected: esperados,
    checkedIn: entraram,
    remaining: Math.max(0, esperados - entraram),
    deniedToday: negadas,
    recent: recentes.map((tentativa) => ({
      id: tentativa.id,
      at: tentativa.createdAt,
      allowed: tentativa.result === 'ALLOWED',
      reason: tentativa.reason,
      method: tentativa.method,
      code: tentativa.ticket?.code ?? tentativa.codeTried,
      personName: tentativa.ticket ? (tentativa.ticket.holderName ?? tentativa.ticket.order.buyerName) : null,
      typeName: tentativa.ticket?.ticketType.name ?? null,
      operatorName: tentativa.user?.name ?? null,
    })),
  };
}
