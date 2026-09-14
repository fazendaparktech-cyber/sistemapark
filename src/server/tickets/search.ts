import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { dateOnlyToDb, dbToDateOnly, type DateOnly } from '@/lib/dates';
import { isValidCpf, onlyDigits } from '@/lib/documents';
import { normalizeOrderCode, type OrderChannelKey, type TicketStatusKey } from '@/lib/orders';
import { effectiveTicketStatus } from '@/lib/tickets';

import { hashCpf, parseTicketQr } from '../signing';

/**
 * Busca de ingressos usada pelo painel e pela portaria: código do ingresso (ou
 * o conteúdo do QR), número do pedido, CPF do visitante ou do cliente, celular
 * e nome. As permissões ficam com quem chama.
 */

export interface TicketFilters {
  q?: string;
  status?: TicketStatusKey;
  visitFrom?: DateOnly;
  visitTo?: DateOnly;
  ticketTypeId?: string;
  page?: number;
}

const CODIGO_DE_INGRESSO = /^[0-9A-HJKMNP-TV-Z]{10}$/;

function condicoesDaBusca(texto: string): Prisma.TicketWhereInput[] {
  const q = texto.trim();
  const ou: Prisma.TicketWhereInput[] = [];

  const lido = parseTicketQr(q);
  if (lido) return [{ code: lido.code }];

  const pedido = normalizeOrderCode(q);
  if (pedido) return [{ order: { code: pedido } }];

  const codigo = q.toUpperCase().replace(/[\s.-]/g, '');
  if (CODIGO_DE_INGRESSO.test(codigo)) ou.push({ code: codigo });

  const digitos = onlyDigits(q);
  if (/^[\d\s().+-]+$/.test(q)) {
    if (digitos.length === 11 && isValidCpf(digitos)) {
      const cpfHash = hashCpf(digitos);
      ou.push({ holderCpfHash: cpfHash }, { customer: { cpfHash } });
    }
    if (digitos.length >= 8) ou.push({ order: { buyerPhone: { contains: digitos } } });
    // Final do número do pedido: "799" encontra CP-2026-000799.
    if (digitos.length > 0 && digitos.length <= 6) {
      ou.push({ order: { code: { endsWith: `-${digitos.padStart(6, '0')}` } } });
    }
  } else {
    ou.push(
      { holderName: { contains: q, mode: 'insensitive' } },
      { order: { buyerName: { contains: q, mode: 'insensitive' } } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
    );
  }
  return ou;
}

export function ticketWhere(parkId: string, filtros: TicketFilters, hoje: DateOnly): Prisma.TicketWhereInput {
  const e: Prisma.TicketWhereInput[] = [{ parkId }];
  const hojeNoBanco = dateOnlyToDb(hoje);

  if (filtros.status === 'ACTIVE') e.push({ status: 'ACTIVE', visitDate: { gte: hojeNoBanco } });
  else if (filtros.status === 'PENDING_PAYMENT') {
    e.push({ status: 'PENDING_PAYMENT', visitDate: { gte: hojeNoBanco } });
  } else if (filtros.status === 'EXPIRED') {
    e.push({
      OR: [
        { status: 'EXPIRED' },
        { status: { in: ['ACTIVE', 'PENDING_PAYMENT'] }, visitDate: { lt: hojeNoBanco } },
      ],
    });
  } else if (filtros.status) e.push({ status: filtros.status });

  if (filtros.visitFrom) e.push({ visitDate: { gte: dateOnlyToDb(filtros.visitFrom) } });
  if (filtros.visitTo) e.push({ visitDate: { lte: dateOnlyToDb(filtros.visitTo) } });
  if (filtros.ticketTypeId) e.push({ ticketTypeId: filtros.ticketTypeId });

  const q = filtros.q?.trim();
  if (q) {
    const ou = condicoesDaBusca(q);
    e.push(ou.length > 0 ? { OR: ou } : { id: { in: [] } });
  }
  return { AND: e };
}

export const TICKET_LIST_SELECT = {
  id: true,
  code: true,
  status: true,
  visitDate: true,
  holderName: true,
  holderCpfMasked: true,
  priceCents: true,
  isCourtesy: true,
  checkedInAt: true,
  ticketType: { select: { name: true } },
  checkedInBy: { select: { name: true } },
  order: { select: { id: true, code: true, buyerName: true, buyerPhone: true, channel: true } },
} satisfies Prisma.TicketSelect;

type IngressoDaLista = Prisma.TicketGetPayload<{ select: typeof TICKET_LIST_SELECT }>;

export interface TicketListItem {
  id: string;
  code: string;
  status: TicketStatusKey;
  typeName: string;
  holderName: string | null;
  holderCpfMasked: string | null;
  buyerName: string;
  buyerPhone: string | null;
  orderId: string;
  orderCode: string;
  channel: OrderChannelKey;
  visitDate: DateOnly;
  priceCents: number;
  isCourtesy: boolean;
  checkedInAt: Date | null;
  checkedInByName: string | null;
}

export function toTicketListItem(ingresso: IngressoDaLista, hoje: DateOnly): TicketListItem {
  const visitDate = dbToDateOnly(ingresso.visitDate);
  return {
    id: ingresso.id,
    code: ingresso.code,
    status: effectiveTicketStatus({ status: ingresso.status, visitDate }, hoje),
    typeName: ingresso.ticketType.name,
    holderName: ingresso.holderName,
    holderCpfMasked: ingresso.holderCpfMasked,
    buyerName: ingresso.order.buyerName,
    buyerPhone: ingresso.order.buyerPhone,
    orderId: ingresso.order.id,
    orderCode: ingresso.order.code,
    channel: ingresso.order.channel,
    visitDate,
    priceCents: ingresso.priceCents,
    isCourtesy: ingresso.isCourtesy,
    checkedInAt: ingresso.checkedInAt,
    checkedInByName: ingresso.checkedInBy?.name ?? null,
  };
}
