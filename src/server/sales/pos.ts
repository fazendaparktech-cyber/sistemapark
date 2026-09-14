import 'server-only';

import QRCode from 'qrcode';

import type { PrismaClient } from '@/generated/prisma/client';
import type { HolderDataKey, TicketCategoryKey } from '@/lib/catalog';
import { addDays, compareDateOnly, dateOnlyToDb, dbToDateOnly, todayIn, type DateOnly } from '@/lib/dates';
import { maskCpf } from '@/lib/documents';
import { plural } from '@/lib/format';
import { allocateCents } from '@/lib/money';
import {
  effectiveOrderStatus,
  PAYMENT_METHOD_LABELS,
  posQuoteSchema,
  posSaleSchema,
  type OrderStatusKey,
  type PosPaymentMethod,
  type PosQuoteInput,
  type PosSaleInput,
} from '@/lib/orders';
import type { DayKind } from '@/lib/pricing';

import { recordAudit } from '../audit';
import { can, requirePermission, type AuthContext } from '../auth/context';
import { getCalendarRange, type CalendarDay } from '../calendar/service';
import { sellableTicketTypes } from '../catalog/service';
import { evaluateCouponForOrder, type CouponApplication } from '../coupons/service';
import { upsertCustomerByCpf } from '../customers/service';
import { prisma, type DbClient, type Tx } from '../db';
import { onlinePaymentsAvailable } from '../env';
import { AppError, Errors, fromZodError, isAppError } from '../errors';
import { logger } from '../logger';
import { orderPublicUrl, sendOrderConfirmedEmail } from '../orders/emails';
import { ensurePixPayment, paymentSimulationEnabled, simulateMockPayment } from '../payments/service';
import { isUniqueViolation } from '../prisma-errors';
import type { RequestMeta } from '../request';
import { getSalesSettings } from '../settings/service';
import { hashCpf } from '../signing';
import { lockParkDayByDate, occupiedPeople } from './availability';
import { newTicketCodes, validateHolders, type OrderLine } from './checkout';
import { nextOrderCode } from './order-code';

/**
 * Venda presencial (bilheteria). Mesmas garantias da compra pelo site: preço
 * calculado no servidor, dia travado durante a venda e lotação conferida com
 * as vagas já vendidas e reservadas pelo site. Dinheiro e cartão na maquininha
 * confirmam na hora; PIX gera a cobrança e reserva as vagas até o pagamento.
 */

/** Prazo mínimo do PIX gerado no balcão, mesmo que o site use um prazo menor. */
const PRAZO_MINIMO_DO_PIX_MINUTOS = 15;
const DIAS_NA_AGENDA = 30;

type DadosDaVenda = ReturnType<typeof posSaleSchema.parse>;

// ─── Oferta do dia ──────────────────────────────────────────────────────────

export interface PosDay {
  date: DateOnly;
  status: 'OPEN' | 'CLOSED' | null;
  opensAt: string | null;
  closesAt: string | null;
  label: string | null;
  capacity: number | null;
  sold: number;
  held: number;
  available: number | null;
}

export interface PosTicketOption {
  id: string;
  name: string;
  description: string | null;
  category: TicketCategoryKey;
  priceCents: number;
  compareAtCents: number | null;
  priceLabel: string | null;
  peoplePerTicket: number;
  occupiesCapacity: boolean;
  minPerOrder: number | null;
  maxPerOrder: number | null;
  holderData: HolderDataKey;
  minAge: number | null;
  maxAge: number | null;
  /** Unidades que ainda cabem na cota do dia; `null` sem cota própria. */
  remainingUnits: number | null;
}

export interface PosOffer {
  today: DateOnly;
  date: DateOnly;
  day: PosDay | null;
  blocker: string | null;
  ticketTypes: PosTicketOption[];
  /** Próximos dias abertos, para escolher a data rapidamente. */
  upcoming: PosDay[];
  pixAvailable: boolean;
  canDiscount: boolean;
}

function paraDia(dia: CalendarDay): PosDay {
  return {
    date: dia.date,
    status: dia.status,
    opensAt: dia.opensAt,
    closesAt: dia.closesAt,
    label: dia.label,
    capacity: dia.capacity,
    sold: dia.sold,
    held: dia.held,
    available: dia.available,
  };
}

export async function getPosOffer(
  auth: AuthContext,
  date: DateOnly | null,
  db: DbClient = prisma,
  now: Date = new Date(),
): Promise<PosOffer> {
  requirePermission(auth, 'pos.sell');
  const parkId = auth.park.id;
  const hoje = todayIn(auth.park.timezone, now);
  const data = date && compareDateOnly(date, hoje) >= 0 ? date : hoje;

  const [agenda, escolhido, registro] = await Promise.all([
    getCalendarRange(parkId, hoje, addDays(hoje, DIAS_NA_AGENDA - 1), db),
    getCalendarRange(parkId, data, data, db),
    db.parkDay.findUnique({
      where: { parkId_date: { parkId, date: dateOnlyToDb(data) } },
      select: { id: true, dayKind: true, status: true },
    }),
  ]);
  const dia = escolhido[0] ?? null;

  const tipos =
    registro?.status === 'OPEN'
      ? await sellableTicketTypes(db, {
          parkId,
          parkDayId: registro.id,
          date: data,
          dayKindOverride: registro.dayKind,
          channel: 'POS',
          now,
        })
      : [];

  let bloqueio: string | null = null;
  if (!dia || dia.status !== 'OPEN')
    bloqueio = 'O parque não abre nesta data. Para vender, abra o dia no calendário.';
  else if ((dia.available ?? 0) <= 0) bloqueio = 'Não há mais vagas para esta data.';
  else if (tipos.length === 0) {
    bloqueio = 'Nenhum ingresso está à venda no balcão para esta data. Confira os tipos de ingresso.';
  }

  return {
    today: hoje,
    date: data,
    day: dia ? paraDia(dia) : null,
    blocker: bloqueio,
    ticketTypes: tipos.map((tipo) => ({
      id: tipo.id,
      name: tipo.name,
      description: tipo.description,
      category: tipo.category,
      priceCents: tipo.priceCents,
      compareAtCents: tipo.compareAtCents,
      priceLabel: tipo.priceLabel,
      peoplePerTicket: tipo.peoplePerTicket,
      occupiesCapacity: tipo.occupiesCapacity,
      minPerOrder: tipo.minPerOrder,
      maxPerOrder: tipo.maxPerOrder,
      holderData: tipo.holderData,
      minAge: tipo.minAge,
      maxAge: tipo.maxAge,
      remainingUnits: tipo.remainingUnits,
    })),
    upcoming: agenda.filter((item) => item.status === 'OPEN').map(paraDia),
    pixAvailable: onlinePaymentsAvailable(),
    canDiscount: can(auth, 'pos.discount'),
  };
}

// ─── Cálculo (prévia e venda usam o mesmo) ──────────────────────────────────

interface ItemEscolhido {
  ticketTypeId: string;
  quantity: number;
}

interface Calculo {
  dia: { id: string; date: DateOnly; capacity: number; dayKind: DayKind | null };
  linhas: OrderLine[];
  pessoas: number;
  livres: number;
  subtotal: number;
  cupom: CouponApplication | null;
  erroDoCupom: string | null;
  descontoDoCupom: number;
  descontoManual: number;
  /** Desconto total de cada linha (cupom + manual), na ordem de `linhas`. */
  descontos: number[];
  total: number;
}

function agruparItens(itens: readonly ItemEscolhido[]): ItemEscolhido[] {
  const porTipo = new Map<string, number>();
  for (const item of itens)
    porTipo.set(item.ticketTypeId, (porTipo.get(item.ticketTypeId) ?? 0) + item.quantity);
  return [...porTipo].map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
}

async function calcularVenda(
  db: DbClient,
  auth: AuthContext,
  entrada: {
    visitDate: DateOnly;
    items: readonly ItemEscolhido[];
    couponCode: string | null;
    manualDiscountCents: number;
    customerId: string | null;
    cpfHash: string | null;
  },
  opcoes: { lock: boolean; now: Date; tolerateCouponError: boolean },
): Promise<Calculo> {
  const parkId = auth.park.id;
  if (compareDateOnly(entrada.visitDate, todayIn(auth.park.timezone, opcoes.now)) < 0) {
    throw new AppError('DATE_UNAVAILABLE', 'Esta data já passou. Escolha outra data.');
  }

  let dia: {
    id: string;
    date: DateOnly;
    status: 'OPEN' | 'CLOSED';
    capacity: number;
    dayKind: DayKind | null;
  } | null;
  if (opcoes.lock) {
    dia = await lockParkDayByDate(db, parkId, entrada.visitDate);
  } else {
    const registro = await db.parkDay.findUnique({
      where: { parkId_date: { parkId, date: dateOnlyToDb(entrada.visitDate) } },
    });
    dia = registro
      ? {
          id: registro.id,
          date: dbToDateOnly(registro.date),
          status: registro.status,
          capacity: registro.capacity,
          dayKind: registro.dayKind,
        }
      : null;
  }
  if (!dia || dia.status !== 'OPEN') {
    throw new AppError(
      'DATE_UNAVAILABLE',
      'O parque não abre nesta data. Para vender, abra o dia no calendário.',
    );
  }

  const itens = agruparItens(entrada.items);
  if (opcoes.lock) {
    // Lotes de preço travados: duas vendas não levam o último ingresso do lote ao mesmo tempo.
    await db.$queryRaw`
      SELECT id FROM ticket_prices
      WHERE ticket_type_id = ANY(${itens.map((item) => item.ticketTypeId)}::uuid[]) AND lot_quantity IS NOT NULL
      ORDER BY id
      FOR UPDATE`;
  }

  const tipos = await sellableTicketTypes(db, {
    parkId,
    parkDayId: dia.id,
    date: dia.date,
    dayKindOverride: dia.dayKind,
    channel: 'POS',
    now: opcoes.now,
    quantities: new Map(itens.map((item) => [item.ticketTypeId, item.quantity])),
  });
  const ordem = new Map(tipos.map((tipo, indice) => [tipo.id, indice]));
  const linhas: OrderLine[] = itens
    .map((item) => {
      const tipo = tipos.find((candidato) => candidato.id === item.ticketTypeId);
      if (!tipo) {
        throw new AppError(
          'CONFLICT',
          'Um dos ingressos escolhidos não está à venda no balcão para esta data. Atualize a tela.',
        );
      }
      if (tipo.minPerOrder !== null && item.quantity < tipo.minPerOrder) {
        throw new AppError('LIMIT_EXCEEDED', `${tipo.name}: o mínimo por venda é ${tipo.minPerOrder}.`);
      }
      if (tipo.maxPerOrder !== null && item.quantity > tipo.maxPerOrder) {
        throw new AppError('LIMIT_EXCEEDED', `${tipo.name}: o máximo por venda é ${tipo.maxPerOrder}.`);
      }
      if (tipo.remainingUnits !== null && item.quantity > tipo.remainingUnits) {
        throw new AppError(
          'SOLD_OUT',
          tipo.remainingUnits === 0
            ? `${tipo.name}: esgotado para esta data.`
            : `${tipo.name}: restam ${tipo.remainingUnits} para esta data.`,
        );
      }
      return {
        tipo,
        quantidade: item.quantity,
        ingressos: item.quantity * tipo.peoplePerTicket,
        totalCents: item.quantity * tipo.priceCents,
      };
    })
    .sort((a, b) => (ordem.get(a.tipo.id) ?? 0) - (ordem.get(b.tipo.id) ?? 0));

  const pessoas = linhas.reduce(
    (soma, linha) => soma + (linha.tipo.occupiesCapacity ? linha.ingressos : 0),
    0,
  );
  const livres = Math.max(0, dia.capacity - (await occupiedPeople(db, dia.id)));
  if (pessoas > livres) {
    throw new AppError(
      'SOLD_OUT',
      livres === 0
        ? 'Não há mais vagas para esta data.'
        : `Restam ${plural(livres, 'vaga', 'vagas')} para esta data, e esta venda ocupa ${pessoas}.`,
      { details: { available: livres } },
    );
  }

  const subtotal = linhas.reduce((soma, linha) => soma + linha.totalCents, 0);
  let cupom: CouponApplication | null = null;
  let erroDoCupom: string | null = null;
  if (entrada.couponCode) {
    try {
      cupom = await evaluateCouponForOrder(db, {
        parkId,
        code: entrada.couponCode,
        now: opcoes.now,
        visitDate: dia.date,
        channel: 'POS',
        items: linhas.map((linha) => ({ ticketTypeId: linha.tipo.id, totalCents: linha.totalCents })),
        customerId: entrada.customerId,
        cpfHash: entrada.cpfHash,
        lock: opcoes.lock,
      });
    } catch (erro) {
      if (!opcoes.tolerateCouponError || !isAppError(erro) || erro.code !== 'COUPON_INVALID') throw erro;
      erroDoCupom = erro.message;
    }
  }

  const descontoDoCupom = cupom?.discountCents ?? 0;
  const descontosDoCupom = linhas.map(() => 0);
  if (cupom) {
    const elegiveis = cupom.eligibleTicketTypeIds;
    const pesos = linhas.map((linha) =>
      elegiveis === null || elegiveis.includes(linha.tipo.id) ? linha.totalCents : 0,
    );
    allocateCents(descontoDoCupom, pesos).forEach((valor, indice) => {
      descontosDoCupom[indice] = valor;
    });
  }

  const descontoManual = entrada.manualDiscountCents;
  if (descontoManual > 0) {
    requirePermission(auth, 'pos.discount');
    if (descontoManual > subtotal - descontoDoCupom) {
      const mensagem = 'O desconto não pode ser maior que o valor da venda.';
      throw new AppError('VALIDATION_ERROR', mensagem, {
        details: { fields: { manualDiscountCents: mensagem } },
      });
    }
  }
  const restante = linhas.map((linha, indice) => linha.totalCents - (descontosDoCupom[indice] ?? 0));
  const descontosManuais = descontoManual > 0 ? allocateCents(descontoManual, restante) : linhas.map(() => 0);

  return {
    dia: { id: dia.id, date: dia.date, capacity: dia.capacity, dayKind: dia.dayKind },
    linhas,
    pessoas,
    livres,
    subtotal,
    cupom,
    erroDoCupom,
    descontoDoCupom,
    descontoManual,
    descontos: linhas.map((_, indice) => (descontosDoCupom[indice] ?? 0) + (descontosManuais[indice] ?? 0)),
    total: subtotal - descontoDoCupom - descontoManual,
  };
}

// ─── Prévia ─────────────────────────────────────────────────────────────────

export interface PosQuote {
  date: DateOnly;
  /** Vagas livres antes desta venda. */
  available: number;
  people: number;
  lines: {
    ticketTypeId: string;
    name: string;
    priceLabel: string | null;
    holderData: HolderDataKey;
    quantity: number;
    people: number;
    unitPriceCents: number;
    totalCents: number;
    discountCents: number;
  }[];
  subtotalCents: number;
  couponDiscountCents: number;
  manualDiscountCents: number;
  totalCents: number;
  coupon: { code: string; summary: string } | null;
  couponError: string | null;
}

export async function quotePosSale(
  auth: AuthContext,
  input: PosQuoteInput,
  db: DbClient = prisma,
  now: Date = new Date(),
): Promise<PosQuote> {
  requirePermission(auth, 'pos.sell');
  const parsed = posQuoteSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const dados = parsed.data;

  let cpfHash = dados.buyerCpf ? hashCpf(dados.buyerCpf) : null;
  if (!cpfHash && dados.customerId) {
    const cliente = await db.customer.findFirst({
      where: { id: dados.customerId, parkId: auth.park.id },
      select: { cpfHash: true },
    });
    cpfHash = cliente?.cpfHash ?? null;
  }

  const calculo = await calcularVenda(
    db,
    auth,
    { ...dados, cpfHash },
    { lock: false, now, tolerateCouponError: true },
  );
  return {
    date: calculo.dia.date,
    available: calculo.livres,
    people: calculo.pessoas,
    lines: calculo.linhas.map((linha, indice) => ({
      ticketTypeId: linha.tipo.id,
      name: linha.tipo.name,
      priceLabel: linha.tipo.priceLabel,
      holderData: linha.tipo.holderData,
      quantity: linha.quantidade,
      people: linha.ingressos,
      unitPriceCents: linha.tipo.priceCents,
      totalCents: linha.totalCents,
      discountCents: calculo.descontos[indice] ?? 0,
    })),
    subtotalCents: calculo.subtotal,
    couponDiscountCents: calculo.descontoDoCupom,
    manualDiscountCents: calculo.descontoManual,
    totalCents: calculo.total,
    coupon: calculo.cupom ? { code: calculo.cupom.code, summary: calculo.cupom.summary } : null,
    couponError: calculo.erroDoCupom,
  };
}

// ─── Venda ──────────────────────────────────────────────────────────────────

export interface PosPix {
  payload: string;
  qrSvg: string;
  expiresAt: Date | null;
  amountCents: number;
}

export interface PosSaleResult {
  orderId: string;
  code: string;
  status: OrderStatusKey;
  totalCents: number;
  paymentMethod: PosPaymentMethod;
  /** Troco a devolver quando o cliente pagou em dinheiro. */
  changeCents: number | null;
  publicUrl: string;
  hasPhone: boolean;
  emailSent: boolean;
  pix: PosPix | null;
  pixError: string | null;
}

async function pixDoPedido(db: DbClient, orderId: string): Promise<PosPix | null> {
  const pagamento = await db.payment.findFirst({
    where: { orderId, method: 'PIX', status: 'AWAITING', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!pagamento?.pixPayload) return null;
  return {
    payload: pagamento.pixPayload,
    qrSvg: await QRCode.toString(pagamento.pixPayload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
    expiresAt: pagamento.expiresAt,
    amountCents: pagamento.amountCents,
  };
}

async function resultadoDaVenda(
  db: DbClient,
  orderId: string,
  extras: {
    paymentMethod: PosPaymentMethod;
    changeCents: number | null;
    emailSent: boolean;
    pixError: string | null;
  },
): Promise<PosSaleResult> {
  const pedido = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      status: true,
      expiresAt: true,
      totalCents: true,
      accessVersion: true,
      buyerPhone: true,
    },
  });
  const status = effectiveOrderStatus(pedido);
  return {
    orderId: pedido.id,
    code: pedido.code,
    status,
    totalCents: pedido.totalCents,
    paymentMethod: extras.paymentMethod,
    changeCents: extras.changeCents,
    publicUrl: orderPublicUrl(pedido),
    hasPhone: pedido.buyerPhone !== null,
    emailSent: extras.emailSent,
    pix: status === 'PENDING_PAYMENT' ? await pixDoPedido(db, orderId) : null,
    pixError: extras.pixError,
  };
}

/**
 * Cliente da venda: o escolhido na busca; senão pelo CPF; senão pelo celular ou
 * e-mail com o mesmo nome (famílias costumam dividir o celular). Sem nenhum
 * contato, a venda fica sem cadastro de cliente.
 */
async function clienteDaVenda(
  tx: Tx,
  parkId: string,
  dados: DadosDaVenda,
  escolhido: { id: string; phone: string | null; email: string | null } | null,
): Promise<string | null> {
  const { buyer } = dados;
  if (escolhido) {
    const complemento = {
      ...(!escolhido.phone && buyer.phone ? { phone: buyer.phone } : {}),
      ...(!escolhido.email && buyer.email ? { email: buyer.email } : {}),
    };
    if (Object.keys(complemento).length > 0) {
      await tx.customer.update({ where: { id: escolhido.id }, data: complemento });
    }
    return escolhido.id;
  }
  if (buyer.cpf) {
    const cliente = await upsertCustomerByCpf(tx, {
      parkId,
      name: buyer.name,
      email: buyer.email,
      phone: buyer.phone,
      cpfDigits: buyer.cpf,
      marketingOptIn: dados.marketingOptIn,
    });
    return cliente.id;
  }
  if (!buyer.phone && !buyer.email) return null;

  const contatos = [
    ...(buyer.phone ? [{ phone: buyer.phone }] : []),
    ...(buyer.email ? [{ email: buyer.email }] : []),
  ];
  const existente = await tx.customer.findFirst({
    where: { parkId, name: { equals: buyer.name, mode: 'insensitive' }, OR: contatos },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existente) return existente.id;
  const criado = await tx.customer.create({
    data: {
      parkId,
      name: buyer.name,
      email: buyer.email,
      phone: buyer.phone,
      marketingOptIn: dados.marketingOptIn,
    },
    select: { id: true },
  });
  return criado.id;
}

export async function placePosOrder(
  auth: AuthContext,
  input: PosSaleInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<PosSaleResult> {
  requirePermission(auth, 'pos.sell');
  const parsed = posSaleSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const dados = parsed.data;
  const parkId = auth.park.id;

  // Mesmo envio repetido (clique duplo, rede instável): devolve a venda já registrada.
  const anterior = await db.order.findUnique({
    where: { idempotencyKey: dados.idempotencyKey },
    select: { id: true, parkId: true },
  });
  if (anterior) {
    if (anterior.parkId !== parkId) throw Errors.conflict('Esta venda já foi registrada.');
    return resultadoDaVenda(db, anterior.id, {
      paymentMethod: dados.paymentMethod,
      changeCents: null,
      emailSent: false,
      pixError: null,
    });
  }

  if (dados.paymentMethod === 'PIX' && !onlinePaymentsAvailable()) {
    throw new AppError(
      'SALES_UNAVAILABLE',
      'O PIX pelo sistema não está disponível agora. Receba em dinheiro ou no cartão.',
    );
  }

  const [config, parque, escolhido] = await Promise.all([
    getSalesSettings(parkId, db),
    db.park.findUniqueOrThrow({ where: { id: parkId }, select: { id: true, orderCodePrefix: true } }),
    dados.customerId
      ? db.customer.findFirst({
          where: { id: dados.customerId, parkId },
          select: { id: true, cpfHash: true, phone: true, email: true },
        })
      : Promise.resolve(null),
  ]);
  if (dados.customerId && !escolhido) throw Errors.notFound('Cliente não encontrado.');
  const cpfHash = dados.buyer.cpf ? hashCpf(dados.buyer.cpf) : (escolhido?.cpfHash ?? null);

  let transacao: { orderId: string; confirmed: boolean; changeCents: number | null };
  try {
    transacao = await db.$transaction(
      async (tx) => {
        const calculo = await calcularVenda(
          tx,
          auth,
          {
            visitDate: dados.visitDate,
            items: dados.items,
            couponCode: dados.couponCode,
            manualDiscountCents: dados.manualDiscountCents,
            customerId: escolhido?.id ?? null,
            cpfHash,
          },
          { lock: true, now, tolerateCouponError: false },
        );
        const { dia, linhas, total } = calculo;

        if (calculo.descontoManual > 0 && !dados.discountReason) {
          const mensagem = 'Informe o motivo do desconto.';
          throw new AppError('VALIDATION_ERROR', mensagem, {
            details: { fields: { discountReason: mensagem } },
          });
        }

        let troco: number | null = null;
        if (dados.paymentMethod === 'CASH' && dados.cashReceivedCents !== null && total > 0) {
          if (dados.cashReceivedCents < total) {
            const mensagem = 'O valor recebido é menor que o total da venda.';
            throw new AppError('VALIDATION_ERROR', mensagem, {
              details: { fields: { cashReceivedCents: mensagem } },
            });
          }
          troco = dados.cashReceivedCents - total;
        }

        const visitantes = validateHolders(linhas, dados.holders, dia.date, { required: false });
        const clienteId = await clienteDaVenda(tx, parkId, dados, escolhido);

        if (clienteId) {
          for (const linha of linhas) {
            const limite = linha.tipo.maxPerCustomerPerDay;
            if (limite === null) continue;
            const [soma] = await tx.$queryRaw<{ units: number }[]>`
              SELECT COALESCE(SUM(oi.quantity), 0)::int AS units
              FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              WHERE o.customer_id = ${clienteId}::uuid
                AND o.park_day_id = ${dia.id}::uuid
                AND oi.ticket_type_id = ${linha.tipo.id}::uuid
                AND (o.status = 'CONFIRMED' OR (o.status = 'PENDING_PAYMENT' AND o.expires_at > now()))`;
            const jaTem = soma?.units ?? 0;
            if (jaTem + linha.quantidade > limite) {
              throw new AppError(
                'LIMIT_EXCEEDED',
                jaTem > 0
                  ? `${linha.tipo.name}: o limite é de ${limite} por cliente nesta data, e este cliente já tem ${jaTem}.`
                  : `${linha.tipo.name}: o limite é de ${limite} por cliente nesta data.`,
              );
            }
          }
        }

        const gratis = total === 0;
        const confirmado = gratis || dados.paymentMethod !== 'PIX';
        const expiraEm = confirmado
          ? null
          : new Date(
              now.getTime() + Math.max(config.paymentWindowMinutes, PRAZO_MINIMO_DO_PIX_MINUTOS) * 60_000,
            );
        const codigo = await nextOrderCode(tx, parque, Number(todayIn(auth.park.timezone, now).slice(0, 4)));
        const desconto = calculo.descontoDoCupom + calculo.descontoManual;

        const pedido = await tx.order.create({
          data: {
            parkId,
            code: codigo,
            customerId: clienteId,
            buyerName: dados.buyer.name,
            buyerEmail: dados.buyer.email,
            buyerPhone: dados.buyer.phone,
            buyerCpfMasked: dados.buyer.cpf ? maskCpf(dados.buyer.cpf) : null,
            parkDayId: dia.id,
            visitDate: dateOnlyToDb(dia.date),
            status: confirmado ? 'CONFIRMED' : 'PENDING_PAYMENT',
            financialStatus: gratis ? 'NOT_APPLICABLE' : confirmado ? 'PAID' : 'UNPAID',
            channel: 'POS',
            subtotalCents: calculo.subtotal,
            discountCents: desconto,
            feeCents: 0,
            totalCents: total,
            couponId: calculo.cupom?.couponId ?? null,
            soldById: auth.user.id,
            authorizedById: calculo.descontoManual > 0 ? auth.user.id : null,
            notes: calculo.descontoManual > 0 ? `Desconto manual: ${dados.discountReason ?? ''}` : null,
            expiresAt: expiraEm,
            confirmedAt: confirmado ? now : null,
            idempotencyKey: dados.idempotencyKey,
            createdIp: meta.ip,
            userAgent: meta.userAgent,
          },
        });

        const usados = new Set<string>();
        let totalDeIngressos = 0;
        for (const [indice, linha] of linhas.entries()) {
          const descontoDaLinha = calculo.descontos[indice] ?? 0;
          const item = await tx.orderItem.create({
            data: {
              orderId: pedido.id,
              ticketTypeId: linha.tipo.id,
              ticketPriceId: linha.tipo.priceRuleId,
              ticketTypeName: linha.tipo.name,
              priceLabel: linha.tipo.priceLabel,
              quantity: linha.quantidade,
              unitPriceCents: linha.tipo.priceCents,
              discountCents: descontoDaLinha,
              totalCents: linha.totalCents - descontoDaLinha,
            },
          });
          const precos = allocateCents(
            linha.totalCents - descontoDaLinha,
            Array.from({ length: linha.ingressos }, () => 1),
          );
          const pessoasDaLinha = visitantes.get(linha.tipo.id) ?? [];
          const criados = await tx.ticket.createManyAndReturn({
            data: newTicketCodes(linha.ingressos, usados).map((code, n) => {
              const visitante = pessoasDaLinha[n];
              return {
                parkId,
                orderId: pedido.id,
                orderItemId: item.id,
                ticketTypeId: linha.tipo.id,
                customerId: clienteId,
                parkDayId: dia.id,
                visitDate: dateOnlyToDb(dia.date),
                code,
                status: confirmado ? ('ACTIVE' as const) : ('PENDING_PAYMENT' as const),
                holderName: visitante?.name ?? null,
                holderBirthDate: visitante?.birthDate ? dateOnlyToDb(visitante.birthDate) : null,
                holderCpfMasked: visitante?.cpfDigits ? maskCpf(visitante.cpfDigits) : null,
                holderCpfHash: visitante?.cpfDigits ? hashCpf(visitante.cpfDigits) : null,
                occupiesCapacity: linha.tipo.occupiesCapacity,
                priceCents: precos[n] ?? 0,
                activatedAt: confirmado ? now : null,
              };
            }),
            select: { id: true },
          });
          await tx.ticketEvent.createMany({
            data: criados.flatMap(({ id }) =>
              confirmado
                ? [
                    { ticketId: id, type: 'CREATED' as const, actorUserId: auth.user.id },
                    { ticketId: id, type: 'ACTIVATED' as const, actorUserId: auth.user.id },
                  ]
                : [{ ticketId: id, type: 'CREATED' as const, actorUserId: auth.user.id }],
            ),
          });
          totalDeIngressos += linha.ingressos;
        }

        if (!confirmado) {
          // PIX em aberto: as vagas ficam reservadas até o prazo do pagamento.
          await tx.capacityHold.create({
            data: {
              parkId,
              parkDayId: dia.id,
              orderId: pedido.id,
              people: calculo.pessoas,
              expiresAt: expiraEm ?? now,
              items: {
                create: linhas.map((linha) => ({ ticketTypeId: linha.tipo.id, quantity: linha.quantidade })),
              },
            },
          });
        } else if (!gratis) {
          const pagamento = await tx.payment.create({
            data: {
              parkId,
              orderId: pedido.id,
              provider: 'MANUAL',
              method: dados.paymentMethod,
              status: 'APPROVED',
              amountCents: total,
              approvedAt: now,
              idempotencyKey: `balcao:${pedido.id}`,
              createdById: auth.user.id,
            },
          });
          await tx.paymentTransaction.create({
            data: {
              paymentId: pagamento.id,
              kind: 'CREATED',
              toStatus: 'APPROVED',
              amountCents: total,
              data: {
                receivedById: auth.user.id,
                cashReceivedCents: dados.paymentMethod === 'CASH' ? dados.cashReceivedCents : null,
                changeCents: troco,
              },
            },
          });
        }

        if (calculo.cupom) {
          await tx.couponUsage.create({
            data: {
              couponId: calculo.cupom.couponId,
              orderId: pedido.id,
              customerId: clienteId,
              cpfHash,
              discountCents: calculo.descontoDoCupom,
              status: confirmado ? 'CONFIRMED' : 'RESERVED',
            },
          });
        }

        await recordAudit(tx, {
          action: 'orders.created',
          parkId,
          actorUserId: auth.user.id,
          entityType: 'order',
          entityId: pedido.id,
          data: {
            code: codigo,
            channel: 'POS',
            visitDate: dia.date,
            tickets: totalDeIngressos,
            subtotalCents: calculo.subtotal,
            discountCents: desconto,
            manualDiscountCents: calculo.descontoManual,
            discountReason: dados.discountReason,
            totalCents: total,
            coupon: calculo.cupom?.code ?? null,
            paymentMethod: dados.paymentMethod,
          },
          meta,
        });
        if (confirmado) {
          await recordAudit(tx, {
            action: 'orders.confirmed',
            parkId,
            actorUserId: auth.user.id,
            entityType: 'order',
            entityId: pedido.id,
            data: {
              code: codigo,
              reason: gratis
                ? 'Pedido sem valor a pagar'
                : `Pagamento recebido no balcão (${PAYMENT_METHOD_LABELS[dados.paymentMethod].toLowerCase()})`,
            },
            meta,
          });
        }

        return { orderId: pedido.id, confirmed: confirmado, changeCents: troco };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (erro) {
    if (isUniqueViolation(erro)) {
      const existente = await db.order.findUnique({
        where: { idempotencyKey: dados.idempotencyKey },
        select: { id: true },
      });
      if (existente) {
        return resultadoDaVenda(db, existente.id, {
          paymentMethod: dados.paymentMethod,
          changeCents: null,
          emailSent: false,
          pixError: null,
        });
      }
    }
    throw erro;
  }

  const { orderId } = transacao;
  let pixError: string | null = null;
  let emailSent = false;
  if (!transacao.confirmed) {
    try {
      await ensurePixPayment(orderId, { cpfDigits: dados.buyer.cpf }, db);
    } catch (erro) {
      logger.error({ err: erro, orderId }, 'venda no balcão sem cobrança PIX');
      pixError = isAppError(erro) ? erro.message : 'Não foi possível gerar o PIX agora. Tente de novo.';
    }
  } else if (dados.buyer.email) {
    emailSent = await sendOrderConfirmedEmail(orderId, db).catch((erro: unknown) => {
      logger.error({ err: erro, orderId }, 'falha ao enviar e-mail da venda no balcão');
      return false;
    });
  }

  return resultadoDaVenda(db, orderId, {
    paymentMethod: dados.paymentMethod,
    changeCents: transacao.changeCents,
    emailSent,
    pixError,
  });
}

// ─── PIX em aberto no balcão ────────────────────────────────────────────────

export interface PosSaleStatus {
  orderId: string;
  code: string;
  status: OrderStatusKey;
  totalCents: number;
  publicUrl: string;
  hasPhone: boolean;
  pix: PosPix | null;
  canSimulate: boolean;
}

async function vendaDoBalcao(db: DbClient, auth: AuthContext, orderId: string) {
  const pedido = await db.order.findFirst({
    where: { id: orderId, parkId: auth.park.id, channel: 'POS' },
    select: {
      id: true,
      code: true,
      status: true,
      expiresAt: true,
      totalCents: true,
      accessVersion: true,
      buyerPhone: true,
    },
  });
  if (!pedido) throw Errors.notFound('Venda não encontrada.');
  return pedido;
}

/** Situação da venda para a tela do balcão acompanhar o PIX. */
export async function getPosSaleStatus(
  auth: AuthContext,
  orderId: string,
  db: DbClient = prisma,
): Promise<PosSaleStatus> {
  requirePermission(auth, 'pos.sell');
  const pedido = await vendaDoBalcao(db, auth, orderId);
  const status = effectiveOrderStatus(pedido);
  const pix = status === 'PENDING_PAYMENT' ? await pixDoPedido(db, orderId) : null;
  return {
    orderId: pedido.id,
    code: pedido.code,
    status,
    totalCents: pedido.totalCents,
    publicUrl: orderPublicUrl(pedido),
    hasPhone: pedido.buyerPhone !== null,
    pix,
    canSimulate: paymentSimulationEnabled() && pix !== null,
  };
}

/** Gera o PIX de novo (o anterior venceu ou o provedor falhou na hora da venda). */
export async function retryPosPix(
  auth: AuthContext,
  orderId: string,
  db: PrismaClient = prisma,
): Promise<PosSaleStatus> {
  requirePermission(auth, 'pos.sell');
  await vendaDoBalcao(db, auth, orderId);
  await ensurePixPayment(orderId, {}, db);
  return getPosSaleStatus(auth, orderId, db);
}

/** Ambiente de teste: simula o banco pagando ou recusando o PIX do balcão. */
export async function simulatePosPix(
  auth: AuthContext,
  orderId: string,
  outcome: 'APPROVED' | 'DECLINED',
  db: PrismaClient = prisma,
): Promise<PosSaleStatus> {
  requirePermission(auth, 'pos.sell');
  if (!paymentSimulationEnabled()) throw Errors.notFound();
  await vendaDoBalcao(db, auth, orderId);
  await simulateMockPayment({ orderId, outcome }, db);
  return getPosSaleStatus(auth, orderId, db);
}
