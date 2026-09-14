import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import { holderRequirements } from '@/lib/catalog';
import { ageOn, compareDateOnly, dateOnlyToDb, isDateOnly, todayIn, type DateOnly } from '@/lib/dates';
import { isValidCpf, maskCpf, onlyDigits } from '@/lib/documents';
import { allocateCents } from '@/lib/money';
import {
  checkoutInputSchema,
  effectiveOrderStatus,
  type CheckoutInput,
  type OrderStatusKey,
} from '@/lib/orders';

import { recordAudit } from '../audit';
import { notifyCapacityThresholds } from '../calendar/alerts';
import { sellableTicketTypes, type SellableTicketType } from '../catalog/service';
import { evaluateCouponForOrder, type CouponApplication } from '../coupons/service';
import { randomCrockford, sha256Hex } from '../crypto';
import { upsertCustomerByCpf } from '../customers/service';
import { prisma, type DbClient } from '../db';
import { onlinePaymentsAvailable } from '../env';
import { AppError, fromZodError } from '../errors';
import { logger } from '../logger';
import { sendOrderConfirmedEmail, sendOrderReceivedEmail } from '../orders/emails';
import type { PublicPark } from '../parks/public';
import { ensurePixPayment } from '../payments/service';
import { isUniqueViolation } from '../prisma-errors';
import { enforceRateLimit, rateLimitKey } from '../rate-limit';
import type { RequestMeta } from '../request';
import { getSalesSettings } from '../settings/service';
import { hashCpf, orderAccessToken } from '../signing';
import { lockParkDayById, occupiedPeople } from './availability';
import { cartExpiredError, cartNotFoundError } from './cart';
import { nextOrderCode } from './order-code';

/**
 * Fechamento da compra pelo site. O que decide valor e vaga acontece numa única
 * transação, com o dia travado: preço calculado no servidor, limites por CPF,
 * cupom travado contra uso simultâneo e as vagas passando da reserva do
 * carrinho para o pedido. Nada que venha do navegador define preço.
 */

export interface CheckoutResult {
  orderId: string;
  code: string;
  accessToken: string;
  status: OrderStatusKey;
  totalCents: number;
}

async function resultadoDoPedido(db: DbClient, orderId: string): Promise<CheckoutResult> {
  const pedido = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { id: true, code: true, status: true, expiresAt: true, totalCents: true, accessVersion: true },
  });
  return {
    orderId: pedido.id,
    code: pedido.code,
    accessToken: orderAccessToken(pedido),
    status: effectiveOrderStatus(pedido),
    totalCents: pedido.totalCents,
  };
}

export interface OrderLine {
  tipo: SellableTicketType;
  quantidade: number;
  /** Ingressos (pessoas) gerados pela linha. */
  ingressos: number;
  totalCents: number;
}

interface Visitante {
  name: string | null;
  birthDate: DateOnly | null;
  cpfDigits: string | null;
}

type VisitanteRecebido = ReturnType<typeof checkoutInputSchema.parse>['holders'][number];

function faixaEtaria(tipo: SellableTicketType): string {
  if (tipo.minAge !== null && tipo.maxAge !== null) {
    return `${tipo.name}: para visitantes de ${tipo.minAge} a ${tipo.maxAge} anos na data da visita`;
  }
  if (tipo.maxAge !== null)
    return `${tipo.name}: para visitantes com até ${tipo.maxAge} anos na data da visita`;
  return `${tipo.name}: para visitantes a partir de ${tipo.minAge ?? 0} anos na data da visita`;
}

/**
 * Dados de cada visitante conforme o que o tipo de ingresso pede. Erros voltam por campo.
 * Com `required: false` (balcão), visitante sem nome fica sem dados; o que for informado é conferido.
 */
export function validateHolders(
  linhas: readonly OrderLine[],
  recebidos: readonly VisitanteRecebido[],
  dataDaVisita: DateOnly,
  opcoes: { required: boolean },
): Map<string, Visitante[]> {
  const campos: Record<string, string> = {};
  const porTipo = new Map<string, Visitante[]>();

  for (const linha of linhas) {
    const pede = holderRequirements(linha.tipo.holderData);
    const doTipo = recebidos
      .map((visitante, indice) => ({ visitante, indice }))
      .filter(({ visitante }) => visitante.ticketTypeId === linha.tipo.id);
    const lista: Visitante[] = [];

    for (let n = 0; n < linha.ingressos; n++) {
      const entrada = doTipo[n];
      if (!pede.name || (!opcoes.required && !entrada?.visitante.name?.trim())) {
        lista.push({ name: null, birthDate: null, cpfDigits: null });
        continue;
      }
      const caminho = entrada ? `holders.${entrada.indice}` : `holders.${linha.tipo.id}.${n}`;
      const nome = entrada?.visitante.name?.trim().replace(/\s+/g, ' ') ?? '';
      if (nome.length < 3) campos[`${caminho}.name`] = 'Informe o nome completo do visitante';

      let cpf: string | null = null;
      if (pede.cpf) {
        const digitos = onlyDigits(entrada?.visitante.cpf ?? '');
        if (isValidCpf(digitos)) cpf = digitos;
        else if (opcoes.required || digitos) campos[`${caminho}.cpf`] = 'CPF inválido';
      }

      let nascimento: DateOnly | null = null;
      if (pede.birthDate) {
        const informado = entrada?.visitante.birthDate ?? '';
        if (!opcoes.required && !informado) {
          // Nascimento não informado no balcão: fica em branco.
        } else if (!isDateOnly(informado) || compareDateOnly(informado, dataDaVisita) > 0) {
          campos[`${caminho}.birthDate`] = 'Data de nascimento inválida';
        } else {
          nascimento = informado;
          const idade = ageOn(informado, dataDaVisita);
          const foraDaFaixa =
            (linha.tipo.minAge !== null && idade < linha.tipo.minAge) ||
            (linha.tipo.maxAge !== null && idade > linha.tipo.maxAge);
          if (foraDaFaixa) campos[`${caminho}.birthDate`] = faixaEtaria(linha.tipo);
        }
      }
      lista.push({ name: nome, birthDate: nascimento, cpfDigits: cpf });
    }
    porTipo.set(linha.tipo.id, lista);
  }

  if (Object.keys(campos).length > 0) {
    throw new AppError('VALIDATION_ERROR', 'Confira os dados dos visitantes.', {
      details: { fields: campos },
    });
  }
  return porTipo;
}

export function newTicketCodes(quantidade: number, usados: Set<string>): string[] {
  const codigos: string[] = [];
  while (codigos.length < quantidade) {
    const codigo = randomCrockford(10);
    if (usados.has(codigo)) continue;
    usados.add(codigo);
    codigos.push(codigo);
  }
  return codigos;
}

export async function placeOnlineOrder(
  input: {
    park: PublicPark;
    cartToken: string | null | undefined;
    data: CheckoutInput;
    meta: RequestMeta;
    now?: Date;
  },
  db: PrismaClient = prisma,
): Promise<CheckoutResult> {
  const parsed = checkoutInputSchema.safeParse(input.data);
  if (!parsed.success) throw fromZodError(parsed.error);
  const dados = parsed.data;
  const { park } = input;
  const agora = input.now ?? new Date();

  // Mesmo envio repetido (clique duplo, rede instável): devolve o pedido já criado.
  const anterior = await db.order.findUnique({
    where: { idempotencyKey: dados.idempotencyKey },
    select: { id: true, parkId: true },
  });
  if (anterior && anterior.parkId === park.id) return resultadoDoPedido(db, anterior.id);

  if (!input.cartToken) throw cartNotFoundError();
  const config = await getSalesSettings(park.id, db);
  if (!config.onlineSalesEnabled || !onlinePaymentsAvailable()) {
    throw new AppError(
      'SALES_UNAVAILABLE',
      'As vendas pelo site estão pausadas no momento. Tente novamente mais tarde.',
    );
  }

  const cpfHash = hashCpf(dados.buyer.cpf);
  await enforceRateLimit(
    { key: rateLimitKey('compra-ip', input.meta.ip), limit: 30, windowSeconds: 600 },
    db,
  );
  await enforceRateLimit({ key: rateLimitKey('compra-cpf', cpfHash), limit: 15, windowSeconds: 3600 }, db);

  let transacao: { orderId: string; free: boolean; reused: boolean };
  try {
    transacao = await db.$transaction(
      async (tx) => {
        const [carrinho] = await tx.$queryRaw<
          { id: string; status: string; expires_at: Date; park_day_id: string; order_id: string | null }[]
        >`
          SELECT id, status, expires_at, park_day_id, order_id
          FROM carts
          WHERE token_hash = ${sha256Hex(input.cartToken ?? '')} AND park_id = ${park.id}::uuid
          FOR UPDATE`;
        if (!carrinho) throw cartNotFoundError();
        if (carrinho.status === 'CONVERTED' && carrinho.order_id) {
          return { orderId: carrinho.order_id, free: false, reused: true };
        }
        if (carrinho.status !== 'ACTIVE' || carrinho.expires_at <= agora) throw cartExpiredError();

        const dia = await lockParkDayById(tx, carrinho.park_day_id);
        if (!dia || dia.status !== 'OPEN') {
          throw new AppError('DATE_UNAVAILABLE', 'O parque não abre mais nesta data. Escolha outra data.');
        }

        const [itens, reserva] = await Promise.all([
          tx.cartItem.findMany({
            where: { cartId: carrinho.id },
            include: { ticketType: { select: { name: true, sortOrder: true } } },
          }),
          tx.capacityHold.findUnique({ where: { cartId: carrinho.id } }),
        ]);
        if (itens.length === 0 || !reserva || reserva.status !== 'ACTIVE') throw cartExpiredError();

        // Lotes de preço: travados para dois pedidos não venderem o último ingresso do lote ao mesmo tempo.
        await tx.$queryRaw`
          SELECT id FROM ticket_prices
          WHERE ticket_type_id = ANY(${itens.map((item) => item.ticketTypeId)}::uuid[]) AND lot_quantity IS NOT NULL
          ORDER BY id
          FOR UPDATE`;

        const tipos = await sellableTicketTypes(tx, {
          parkId: park.id,
          parkDayId: dia.id,
          date: dia.date,
          dayKindOverride: dia.dayKind,
          channel: 'ONLINE',
          now: agora,
          quantities: new Map(itens.map((item) => [item.ticketTypeId, item.quantity])),
        });
        const porId = new Map(tipos.map((tipo) => [tipo.id, tipo]));
        const linhas: OrderLine[] = [...itens]
          .sort((a, b) => a.ticketType.sortOrder - b.ticketType.sortOrder)
          .map((item) => {
            const tipo = porId.get(item.ticketTypeId);
            if (!tipo) {
              throw new AppError(
                'CONFLICT',
                `O ingresso ${item.ticketType.name} deixou de ser vendido para esta data. Escolha os ingressos de novo.`,
              );
            }
            return {
              tipo,
              quantidade: item.quantity,
              ingressos: item.quantity * tipo.peoplePerTicket,
              totalCents: item.quantity * tipo.priceCents,
            };
          });

        const visitantes = validateHolders(linhas, dados.holders, dia.date, { required: true });

        const pessoas = linhas.reduce(
          (soma, linha) => soma + (linha.tipo.occupiesCapacity ? linha.ingressos : 0),
          0,
        );
        if (pessoas > reserva.people) {
          const ocupadas = await occupiedPeople(tx, dia.id, reserva.id);
          if (ocupadas + pessoas > dia.capacity) {
            throw new AppError(
              'SOLD_OUT',
              'As vagas para esta data mudaram enquanto você comprava. Escolha os ingressos de novo.',
            );
          }
        }

        const cliente = await upsertCustomerByCpf(tx, {
          parkId: park.id,
          name: dados.buyer.name,
          email: dados.buyer.email,
          phone: dados.buyer.phone,
          cpfDigits: dados.buyer.cpf,
          marketingOptIn: dados.marketingOptIn,
        });

        for (const linha of linhas) {
          const limite = linha.tipo.maxPerCustomerPerDay;
          if (limite === null) continue;
          const [soma] = await tx.$queryRaw<{ units: number }[]>`
            SELECT COALESCE(SUM(oi.quantity), 0)::int AS units
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.customer_id = ${cliente.id}::uuid
              AND o.park_day_id = ${dia.id}::uuid
              AND oi.ticket_type_id = ${linha.tipo.id}::uuid
              AND (o.status = 'CONFIRMED' OR (o.status = 'PENDING_PAYMENT' AND o.expires_at > now()))`;
          const jaTem = soma?.units ?? 0;
          if (jaTem + linha.quantidade > limite) {
            throw new AppError(
              'LIMIT_EXCEEDED',
              jaTem > 0
                ? `${linha.tipo.name}: o limite é de ${limite} por CPF nesta data, e este CPF já tem ${jaTem}.`
                : `${linha.tipo.name}: o limite é de ${limite} por CPF nesta data.`,
            );
          }
        }

        const subtotal = linhas.reduce((soma, linha) => soma + linha.totalCents, 0);
        const descontos = linhas.map(() => 0);
        let cupom: CouponApplication | null = null;
        if (dados.couponCode) {
          cupom = await evaluateCouponForOrder(tx, {
            parkId: park.id,
            code: dados.couponCode,
            now: agora,
            visitDate: dia.date,
            channel: 'ONLINE',
            items: linhas.map((linha) => ({ ticketTypeId: linha.tipo.id, totalCents: linha.totalCents })),
            customerId: cliente.id,
            cpfHash,
            lock: true,
          });
          const elegiveis = cupom.eligibleTicketTypeIds;
          const pesos = linhas.map((linha) =>
            elegiveis === null || elegiveis.includes(linha.tipo.id) ? linha.totalCents : 0,
          );
          allocateCents(cupom.discountCents, pesos).forEach((valor, indice) => {
            descontos[indice] = valor;
          });
        }
        const desconto = descontos.reduce((soma, valor) => soma + valor, 0);
        const total = subtotal - desconto;
        const gratis = total === 0;

        const codigo = await nextOrderCode(tx, park, Number(todayIn(park.timezone, agora).slice(0, 4)));
        const expiraEm = gratis ? null : new Date(agora.getTime() + config.paymentWindowMinutes * 60_000);
        const origem = dados.attribution ?? {};

        const pedido = await tx.order.create({
          data: {
            parkId: park.id,
            code: codigo,
            customerId: cliente.id,
            buyerName: dados.buyer.name,
            buyerEmail: dados.buyer.email,
            buyerPhone: dados.buyer.phone,
            buyerCpfMasked: maskCpf(dados.buyer.cpf),
            parkDayId: dia.id,
            visitDate: dateOnlyToDb(dia.date),
            status: gratis ? 'CONFIRMED' : 'PENDING_PAYMENT',
            financialStatus: gratis ? 'NOT_APPLICABLE' : 'UNPAID',
            channel: 'ONLINE',
            subtotalCents: subtotal,
            discountCents: desconto,
            feeCents: 0,
            totalCents: total,
            couponId: cupom?.couponId ?? null,
            expiresAt: expiraEm,
            confirmedAt: gratis ? agora : null,
            idempotencyKey: dados.idempotencyKey,
            utmSource: origem.utmSource ?? null,
            utmMedium: origem.utmMedium ?? null,
            utmCampaign: origem.utmCampaign ?? null,
            utmContent: origem.utmContent ?? null,
            utmTerm: origem.utmTerm ?? null,
            referrer: origem.referrer ?? null,
            createdIp: input.meta.ip,
            userAgent: input.meta.userAgent,
          },
        });

        const usados = new Set<string>();
        let totalDeIngressos = 0;
        for (const [indice, linha] of linhas.entries()) {
          const descontoDaLinha = descontos[indice] ?? 0;
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
                parkId: park.id,
                orderId: pedido.id,
                orderItemId: item.id,
                ticketTypeId: linha.tipo.id,
                customerId: cliente.id,
                parkDayId: dia.id,
                visitDate: dateOnlyToDb(dia.date),
                code,
                status: gratis ? ('ACTIVE' as const) : ('PENDING_PAYMENT' as const),
                holderName: visitante?.name ?? null,
                holderBirthDate: visitante?.birthDate ? dateOnlyToDb(visitante.birthDate) : null,
                holderCpfMasked: visitante?.cpfDigits ? maskCpf(visitante.cpfDigits) : null,
                holderCpfHash: visitante?.cpfDigits ? hashCpf(visitante.cpfDigits) : null,
                occupiesCapacity: linha.tipo.occupiesCapacity,
                priceCents: precos[n] ?? 0,
                activatedAt: gratis ? agora : null,
              };
            }),
            select: { id: true },
          });
          await tx.ticketEvent.createMany({
            data: criados.flatMap(({ id }) =>
              gratis
                ? [
                    { ticketId: id, type: 'CREATED' as const },
                    { ticketId: id, type: 'ACTIVATED' as const },
                  ]
                : [{ ticketId: id, type: 'CREATED' as const }],
            ),
          });
          totalDeIngressos += linha.ingressos;
        }

        await tx.capacityHold.update({
          where: { id: reserva.id },
          data: {
            orderId: pedido.id,
            people: pessoas,
            status: gratis ? 'CONVERTED' : 'ACTIVE',
            expiresAt: expiraEm ?? reserva.expiresAt,
          },
        });
        await tx.cart.update({
          where: { id: carrinho.id },
          data: { status: 'CONVERTED', orderId: pedido.id },
        });

        if (cupom) {
          await tx.couponUsage.create({
            data: {
              couponId: cupom.couponId,
              orderId: pedido.id,
              customerId: cliente.id,
              cpfHash,
              discountCents: desconto,
              status: gratis ? 'CONFIRMED' : 'RESERVED',
            },
          });
        }

        await recordAudit(tx, {
          action: 'orders.created',
          parkId: park.id,
          actorType: 'CUSTOMER',
          entityType: 'order',
          entityId: pedido.id,
          data: {
            code: codigo,
            channel: 'ONLINE',
            visitDate: dia.date,
            tickets: totalDeIngressos,
            subtotalCents: subtotal,
            discountCents: desconto,
            totalCents: total,
            coupon: cupom?.code ?? null,
          },
          meta: input.meta,
        });
        if (gratis) {
          await recordAudit(tx, {
            action: 'orders.confirmed',
            parkId: park.id,
            actorType: 'SYSTEM',
            entityType: 'order',
            entityId: pedido.id,
            data: { code: codigo, reason: 'Pedido sem valor a pagar' },
          });
        }

        return { orderId: pedido.id, free: gratis, reused: false };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (erro) {
    if (isUniqueViolation(erro)) {
      const existente = await db.order.findUnique({
        where: { idempotencyKey: dados.idempotencyKey },
        select: { id: true },
      });
      if (existente) return resultadoDoPedido(db, existente.id);
    }
    throw erro;
  }

  if (!transacao.reused) {
    const { orderId } = transacao;
    const { parkDayId } = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { parkDayId: true },
    });
    await notifyCapacityThresholds(db, park.id, parkDayId).catch((erro: unknown) =>
      logger.error({ err: erro, orderId }, 'falha ao conferir alerta de lotação'),
    );
    if (transacao.free) {
      await sendOrderConfirmedEmail(orderId, db).catch((erro: unknown) =>
        logger.error({ err: erro, orderId }, 'falha ao enviar e-mail de pedido confirmado'),
      );
    } else {
      try {
        await ensurePixPayment(orderId, { cpfDigits: dados.buyer.cpf }, db);
      } catch (erro) {
        // O pedido fica válido: a página do pedido oferece gerar o PIX de novo.
        logger.error({ err: erro, orderId }, 'pedido criado sem cobrança PIX');
      }
      await sendOrderReceivedEmail(orderId, db).catch((erro: unknown) =>
        logger.error({ err: erro, orderId }, 'falha ao enviar e-mail de pedido recebido'),
      );
    }
  }
  return resultadoDoPedido(db, transacao.orderId);
}
