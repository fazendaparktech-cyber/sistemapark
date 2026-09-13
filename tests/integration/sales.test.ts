import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { todayIn } from '@/lib/dates';
import { parsePeriod } from '@/lib/periods';
import { saveCalendarDay } from '@/server/calendar/service';
import { createPriceRule } from '@/server/catalog/service';
import { createCoupon } from '@/server/coupons/service';
import { getCustomerDetail, listCustomers } from '@/server/customers/service';
import { getDashboard } from '@/server/dashboard/metrics';
import { prisma } from '@/server/db';
import { AppError } from '@/server/errors';
import { setEmailProviderForTesting, type EmailMessage } from '@/server/integrations/email';
import { cancelOrder, listOrders, refundOrder, regenerateOrderLink } from '@/server/orders/admin';
import { getPublicOrder } from '@/server/orders/public';
import { mockGateway } from '@/server/payments';
import { processPaymentWebhook, simulateMockPayment } from '@/server/payments/service';
import { createCart, getCartView } from '@/server/sales/cart';
import { expireStaleSales } from '@/server/sales/expiration';
import { placeOnlineOrder } from '@/server/sales/checkout';

import { authAs, createUser, expectAppError, lastAudit, meta } from '../helpers/factories';
import {
  abrirDia,
  comprador,
  comprar,
  criarParqueDeVendas,
  criarTipo,
  dataFutura,
  proximoDiaUtil,
  proximoSabado,
} from '../helpers/sales';

const enviados: EmailMessage[] = [];

beforeAll(() => {
  setEmailProviderForTesting({
    id: 'mock',
    send: async (mensagem) => {
      enviados.push(mensagem);
      return { provider: 'mock', providerMessageId: randomUUID() };
    },
  });
});

afterAll(() => setEmailProviderForTesting(undefined));

function passado(): Date {
  return new Date(Date.now() - 60_000);
}

async function cobrancaDoPedido(orderId: string): Promise<string> {
  const pagamento = await prisma.payment.findFirstOrThrow({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
  if (!pagamento.providerPaymentId) throw new Error('Pagamento sem cobrança no provedor.');
  return pagamento.providerPaymentId;
}

describe('compra pelo site', () => {
  it('carrinho, PIX, aviso do provedor e ingressos liberados', async () => {
    const { publico } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data, 50);
    const adulto = await criarTipo(publico.id, { basePriceCents: 7000, holderData: 'NAME' });

    const { token, cart } = await createCart({
      park: publico,
      selection: { date: data, items: [{ ticketTypeId: adulto.id, quantity: 2 }] },
      previousToken: null,
      meta: meta(),
    });
    expect(cart.subtotalCents).toBe(14000);
    expect(cart.ticketsCount).toBe(2);

    const buyer = comprador();
    const pedido = await placeOnlineOrder({
      park: publico,
      cartToken: token,
      data: {
        buyer,
        holders: [
          { ticketTypeId: adulto.id, name: 'Maria da Silva Santos' },
          { ticketTypeId: adulto.id, name: 'João Pedro Santos' },
        ],
        couponCode: null,
        marketingOptIn: true,
        acceptTerms: true,
        idempotencyKey: randomUUID(),
      },
      meta: meta(),
    });
    const ano = todayIn(publico.timezone).slice(0, 4);
    expect(pedido.status).toBe('PENDING_PAYMENT');
    expect(pedido.code).toBe(`CP-${ano}-000001`);
    expect(pedido.totalCents).toBe(14000);

    const pagamento = await prisma.payment.findFirstOrThrow({ where: { orderId: pedido.orderId } });
    expect(pagamento.status).toBe('AWAITING');
    expect(pagamento.pixPayload).toMatch(/^000201/);
    expect(
      enviados.some((mensagem) => mensagem.to === buyer.email && mensagem.tag === 'order_received'),
    ).toBe(true);

    expect(await simulateMockPayment({ orderId: pedido.orderId, outcome: 'APPROVED' })).toBe('processed');

    const confirmado = await prisma.order.findUniqueOrThrow({
      where: { id: pedido.orderId },
      include: { tickets: true, hold: true },
    });
    expect(confirmado.status).toBe('CONFIRMED');
    expect(confirmado.financialStatus).toBe('PAID');
    expect(confirmado.tickets.map((ingresso) => ingresso.status)).toEqual(['ACTIVE', 'ACTIVE']);
    expect(confirmado.tickets.map((ingresso) => ingresso.holderName).sort()).toEqual([
      'João Pedro Santos',
      'Maria da Silva Santos',
    ]);
    expect(confirmado.hold?.status).toBe('CONVERTED');
    expect(
      enviados.some((mensagem) => mensagem.to === buyer.email && mensagem.tag === 'order_confirmed'),
    ).toBe(true);

    const visaoDoCliente = await getPublicOrder(publico.id, pedido.code, pedido.accessToken);
    expect(visaoDoCliente?.status).toBe('CONFIRMED');
    expect(visaoDoCliente?.tickets).toHaveLength(2);
    expect(visaoDoCliente?.tickets[0]?.qrSvg).toContain('<svg');
    expect(await getPublicOrder(publico.id, pedido.code, 'x'.repeat(32))).toBeNull();
  });

  it('o mesmo aviso do provedor não é processado duas vezes e assinatura falsa é recusada', async () => {
    const { publico } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const pedido = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }]);

    const cobranca = await cobrancaDoPedido(pedido.orderId);
    await mockGateway().setChargeStatus(cobranca, 'APPROVED');
    const { body, headers } = mockGateway().buildWebhook(cobranca);
    expect(await processPaymentWebhook('MOCK', headers, body)).toBe('processed');
    expect(await processPaymentWebhook('MOCK', headers, body)).toBe('duplicate');
    expect(
      await prisma.ticketEvent.count({ where: { ticket: { orderId: pedido.orderId }, type: 'ACTIVATED' } }),
    ).toBe(1);

    const falso = mockGateway().buildWebhook(cobranca);
    expect(
      await processPaymentWebhook(
        'MOCK',
        new Headers({ 'x-mock-signature': 'assinatura-falsa' }),
        falso.body,
      ),
    ).toBe('invalid_signature');
    const idDoEvento = (JSON.parse(falso.body) as { id: string }).id;
    expect(await prisma.webhookEvent.count({ where: { externalId: idDoEvento } })).toBe(0);
  });

  it('o mesmo envio repetido devolve o mesmo pedido', async () => {
    const { publico } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const chave = randomUUID();
    const buyer = comprador();
    const primeiro = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }], {
      idempotencyKey: chave,
      buyer,
    });
    const repetido = await placeOnlineOrder({
      park: publico,
      cartToken: primeiro.cartToken,
      data: {
        buyer,
        holders: [],
        couponCode: null,
        marketingOptIn: false,
        acceptTerms: true,
        idempotencyKey: chave,
      },
      meta: meta(),
    });
    expect(repetido.orderId).toBe(primeiro.orderId);
    expect(await prisma.order.count({ where: { parkId: publico.id } })).toBe(1);
  });

  it('preço calculado no servidor: fim de semana e lote promocional', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const sabado = proximoSabado();
    const diaUtil = proximoDiaUtil();
    await abrirDia(publico.id, sabado);
    await abrirDia(publico.id, diaUtil);
    const tipo = await criarTipo(publico.id, { basePriceCents: 7000 });
    const regra = {
      compareAtCents: null,
      visitFrom: null,
      visitUntil: null,
      saleFrom: null,
      saleUntil: null,
      isActive: true,
    };
    await createPriceRule(
      auth,
      tipo.id,
      {
        ...regra,
        name: 'Fim de semana',
        priceCents: 9000,
        dayKinds: ['WEEKEND'],
        lotQuantity: null,
        priority: 0,
      },
      meta(),
    );
    await createPriceRule(
      auth,
      tipo.id,
      {
        ...regra,
        name: 'Primeiro lote',
        priceCents: 5000,
        dayKinds: ['WEEKDAY'],
        lotQuantity: 2,
        priority: 10,
      },
      meta(),
    );

    const noSabado = await createCart({
      park: publico,
      selection: { date: sabado, items: [{ ticketTypeId: tipo.id, quantity: 1 }] },
      previousToken: null,
      meta: meta(),
    });
    expect(noSabado.cart.items[0]?.unitPriceCents).toBe(9000);

    const loteInteiro = await comprar(publico, diaUtil, [{ ticketTypeId: tipo.id, quantity: 2 }]);
    expect(loteInteiro.totalCents).toBe(10000);

    const depoisDoLote = await createCart({
      park: publico,
      selection: { date: diaUtil, items: [{ ticketTypeId: tipo.id, quantity: 1 }] },
      previousToken: null,
      meta: meta(),
    });
    expect(depoisDoLote.cart.items[0]?.unitPriceCents).toBe(7000);
  });

  it('dados dos visitantes: nome obrigatório e faixa etária na data da visita', async () => {
    const { publico } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const crianca = await criarTipo(publico.id, {
      name: 'Infantil',
      category: 'CHILD',
      basePriceCents: 4500,
      holderData: 'NAME_BIRTHDATE',
      minAge: 3,
      maxAge: 11,
    });
    const ano = Number(data.slice(0, 4));

    const recusa = await expectAppError(
      comprar(publico, data, [{ ticketTypeId: crianca.id, quantity: 2 }], {
        holders: [
          { ticketTypeId: crianca.id, name: 'Ana Clara', birthDate: `${ano - 5}-01-01` },
          { ticketTypeId: crianca.id, name: 'Lu', birthDate: `${ano - 15}-01-01` },
        ],
      }),
      'VALIDATION_ERROR',
    );
    const campos = recusa.details.fields as Record<string, string>;
    expect(campos['holders.1.name']).toBeDefined();
    expect(campos['holders.1.birthDate']).toContain('de 3 a 11 anos');
    expect(campos['holders.0.birthDate']).toBeUndefined();
  });

  it('limite de ingressos por CPF na mesma data', async () => {
    const { publico } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id, { maxPerCustomerPerDay: 2 });
    const buyer = comprador();
    await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 2 }], { buyer });
    await expectAppError(
      comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }], {
        buyer: { ...buyer, name: 'Outra Pessoa' },
      }),
      'LIMIT_EXCEEDED',
    );
  });
});

describe('lotação e concorrência', () => {
  it('carrinhos simultâneos nunca passam da lotação do dia', async () => {
    const { publico } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data, 4);
    const tipo = await criarTipo(publico.id);

    const tentativas = await Promise.allSettled(
      Array.from({ length: 7 }, () =>
        createCart({
          park: publico,
          selection: { date: data, items: [{ ticketTypeId: tipo.id, quantity: 1 }] },
          previousToken: null,
          meta: meta(),
        }),
      ),
    );
    const aceitas = tentativas.filter((tentativa) => tentativa.status === 'fulfilled');
    const recusadas = tentativas.filter((tentativa) => tentativa.status === 'rejected');
    expect(aceitas).toHaveLength(4);
    expect(recusadas).toHaveLength(3);
    for (const recusa of recusadas) {
      expect(recusa.reason).toBeInstanceOf(AppError);
      expect((recusa.reason as AppError).code).toBe('SOLD_OUT');
    }
  });

  it('pedidos simultâneos recebem números únicos e em sequência', async () => {
    const { publico } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data, 50);
    const tipo = await criarTipo(publico.id);

    const carrinhos = [];
    for (let i = 0; i < 5; i++) {
      carrinhos.push(
        await createCart({
          park: publico,
          selection: { date: data, items: [{ ticketTypeId: tipo.id, quantity: 1 }] },
          previousToken: null,
          meta: meta(),
        }),
      );
    }
    const pedidos = await Promise.all(
      carrinhos.map(({ token }) =>
        placeOnlineOrder({
          park: publico,
          cartToken: token,
          data: {
            buyer: comprador(),
            holders: [],
            couponCode: null,
            marketingOptIn: false,
            acceptTerms: true,
            idempotencyKey: randomUUID(),
          },
          meta: meta(),
        }),
      ),
    );
    const ano = todayIn(publico.timezone).slice(0, 4);
    expect(pedidos.map((pedido) => pedido.code).sort()).toEqual(
      [1, 2, 3, 4, 5].map((n) => `CP-${ano}-00000${n}`),
    );
  });

  it('reserva vencida devolve a vaga, e a rotina de vencimento limpa o carrinho', async () => {
    const { publico } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data, 1);
    const tipo = await criarTipo(publico.id);
    const selecao = { date: data, items: [{ ticketTypeId: tipo.id, quantity: 1 }] };

    const primeiro = await createCart({
      park: publico,
      selection: selecao,
      previousToken: null,
      meta: meta(),
    });
    await expectAppError(
      createCart({ park: publico, selection: selecao, previousToken: null, meta: meta() }),
      'SOLD_OUT',
    );

    await prisma.cart.update({ where: { id: primeiro.cart.id }, data: { expiresAt: passado() } });
    await prisma.capacityHold.updateMany({
      where: { cartId: primeiro.cart.id },
      data: { expiresAt: passado() },
    });
    expect(await getCartView(publico.id, primeiro.token)).toBeNull();

    await createCart({ park: publico, selection: selecao, previousToken: null, meta: meta() });
    await expireStaleSales();
    expect((await prisma.cart.findUniqueOrThrow({ where: { id: primeiro.cart.id } })).status).toBe('EXPIRED');
  });
});

describe('cupons', () => {
  const cupomBase = {
    description: null,
    discountType: 'PERCENT' as const,
    amountCents: null,
    maxDiscountCents: null,
    minOrderCents: null,
    startsOn: null,
    endsOn: null,
    visitFrom: null,
    visitUntil: null,
    weekdays: [],
    maxUsesPerCustomer: null,
    firstPurchaseOnly: false,
    channels: ['ONLINE' as const],
    ticketTypeIds: [],
    isActive: true,
  };

  it('limite de usos vale mesmo com pedidos simultâneos', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    await createCoupon(auth, { ...cupomBase, code: 'VERAO10', percentBps: 1000, maxUses: 1 }, meta());

    const carrinhos = await Promise.all(
      [1, 2].map(() =>
        createCart({
          park: publico,
          selection: { date: data, items: [{ ticketTypeId: tipo.id, quantity: 1 }] },
          previousToken: null,
          meta: meta(),
        }),
      ),
    );
    const tentativas = await Promise.allSettled(
      carrinhos.map(({ token }) =>
        placeOnlineOrder({
          park: publico,
          cartToken: token,
          data: {
            buyer: comprador(),
            holders: [],
            couponCode: 'verao10',
            marketingOptIn: false,
            acceptTerms: true,
            idempotencyKey: randomUUID(),
          },
          meta: meta(),
        }),
      ),
    );
    const aceitas = tentativas.filter((tentativa) => tentativa.status === 'fulfilled');
    const recusadas = tentativas.filter((tentativa) => tentativa.status === 'rejected');
    expect(aceitas).toHaveLength(1);
    expect(recusadas).toHaveLength(1);
    expect((recusadas[0]?.reason as AppError).code).toBe('COUPON_INVALID');
    const aceito = aceitas[0];
    if (aceito?.status === 'fulfilled') expect(aceito.value.totalCents).toBe(6300);
  });

  it('pedido sem valor a pagar é confirmado na hora, sem cobrança', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    await createCoupon(
      auth,
      { ...cupomBase, code: 'CORTESIA100', percentBps: 10_000, maxUses: null },
      meta(),
    );

    const pedido = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }], {
      couponCode: 'CORTESIA100',
    });
    expect(pedido.status).toBe('CONFIRMED');
    expect(pedido.totalCents).toBe(0);
    const salvo = await prisma.order.findUniqueOrThrow({
      where: { id: pedido.orderId },
      include: { tickets: true },
    });
    expect(salvo.financialStatus).toBe('NOT_APPLICABLE');
    expect(salvo.tickets.every((ingresso) => ingresso.status === 'ACTIVE')).toBe(true);
    expect(await prisma.payment.count({ where: { orderId: pedido.orderId } })).toBe(0);
    expect((await prisma.couponUsage.findUniqueOrThrow({ where: { orderId: pedido.orderId } })).status).toBe(
      'CONFIRMED',
    );
  });

  it('código repetido é recusado com mensagem no campo', async () => {
    const { auth } = await criarParqueDeVendas();
    await createCoupon(auth, { ...cupomBase, code: 'FERIAS', percentBps: 500, maxUses: null }, meta());
    const erro = await expectAppError(
      createCoupon(auth, { ...cupomBase, code: 'ferias', percentBps: 500, maxUses: null }, meta()),
      'CONFLICT',
    );
    expect((erro.details.fields as Record<string, string>).code).toBeDefined();
  });
});

describe('vencimento e pagamentos atrasados', () => {
  it('pedido não pago vence e libera ingressos, vaga, cupom e cobrança', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    await createCoupon(
      auth,
      {
        code: 'DEZ',
        description: null,
        discountType: 'PERCENT',
        percentBps: 1000,
        amountCents: null,
        maxDiscountCents: null,
        minOrderCents: null,
        startsOn: null,
        endsOn: null,
        visitFrom: null,
        visitUntil: null,
        weekdays: [],
        maxUses: null,
        maxUsesPerCustomer: null,
        firstPurchaseOnly: false,
        channels: ['ONLINE'],
        ticketTypeIds: [],
        isActive: true,
      },
      meta(),
    );
    const pedido = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 2 }], {
      couponCode: 'DEZ',
    });
    const cobranca = await cobrancaDoPedido(pedido.orderId);
    await prisma.order.update({ where: { id: pedido.orderId }, data: { expiresAt: passado() } });

    const resultado = await expireStaleSales();
    expect(resultado.ordersExpired).toBeGreaterThanOrEqual(1);

    const vencido = await prisma.order.findUniqueOrThrow({
      where: { id: pedido.orderId },
      include: { tickets: true, hold: true, couponUsage: true, payments: true },
    });
    expect(vencido.status).toBe('EXPIRED');
    expect(vencido.tickets.every((ingresso) => ingresso.status === 'EXPIRED')).toBe(true);
    expect(vencido.hold?.status).toBe('EXPIRED');
    expect(vencido.couponUsage?.status).toBe('RELEASED');
    expect(vencido.payments[0]?.status).toBe('EXPIRED');
    expect((await mockGateway().getCharge(cobranca))?.status).toBe('CANCELLED');
    expect(await lastAudit('orders.expired', pedido.orderId)).not.toBeNull();
  });

  it('pagamento que entrou sem aviso é confirmado em vez de vencer', async () => {
    const { publico } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const pedido = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }]);
    await mockGateway().setChargeStatus(await cobrancaDoPedido(pedido.orderId), 'APPROVED');
    await prisma.order.update({ where: { id: pedido.orderId }, data: { expiresAt: passado() } });

    const resultado = await expireStaleSales();
    expect(resultado.ordersRecovered).toBeGreaterThanOrEqual(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: pedido.orderId } })).status).toBe(
      'CONFIRMED',
    );
  });

  it('pagamento depois do prazo, sem vaga, fica marcado para devolução', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data, 1);
    const tipo = await criarTipo(publico.id);

    const atrasado = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }]);
    await prisma.order.update({ where: { id: atrasado.orderId }, data: { expiresAt: passado() } });
    await prisma.capacityHold.updateMany({
      where: { orderId: atrasado.orderId },
      data: { expiresAt: passado() },
    });

    const noPrazo = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }]);
    expect(await simulateMockPayment({ orderId: noPrazo.orderId, outcome: 'APPROVED' })).toBe('processed');

    const cobranca = await cobrancaDoPedido(atrasado.orderId);
    await mockGateway().setChargeStatus(cobranca, 'APPROVED');
    const { body, headers } = mockGateway().buildWebhook(cobranca);
    expect(await processPaymentWebhook('MOCK', headers, body)).toBe('processed');

    const conflito = await prisma.order.findUniqueOrThrow({ where: { id: atrasado.orderId } });
    expect(conflito.status).toBe('EXPIRED');
    expect(conflito.financialStatus).toBe('PAID');
    expect(await lastAudit('orders.late_payment_conflict', atrasado.orderId)).not.toBeNull();

    const painel = await getDashboard(auth, parsePeriod({ periodo: 'hoje' }, todayIn(publico.timezone)));
    expect(painel.refundsDue.orders).toBe(1);
  });
});

describe('painel: pedidos, clientes e indicadores', () => {
  it('cancelamento exige motivo e devolve a vaga', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const pedido = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 2 }]);

    await expectAppError(cancelOrder(auth, pedido.orderId, { reason: 'ok' }, meta()), 'VALIDATION_ERROR');
    const ficha = await cancelOrder(auth, pedido.orderId, { reason: 'Cliente pediu para desistir' }, meta());
    expect(ficha.status).toBe('CANCELLED');
    expect(ficha.tickets.every((ingresso) => ingresso.status === 'CANCELLED')).toBe(true);
    expect(ficha.payments[0]?.status).toBe('CANCELLED');
    const reserva = await prisma.capacityHold.findUniqueOrThrow({ where: { orderId: pedido.orderId } });
    expect(reserva.status).toBe('RELEASED');
    expect(await lastAudit('orders.cancelled', pedido.orderId)).not.toBeNull();
  });

  it('reembolso total de pedido pago, uma única vez', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const pedido = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }]);
    await simulateMockPayment({ orderId: pedido.orderId, outcome: 'APPROVED' });

    const ficha = await refundOrder(auth, pedido.orderId, { reason: 'Chuva forte no dia da visita' }, meta());
    expect(ficha.status).toBe('CANCELLED');
    expect(ficha.financialStatus).toBe('REFUNDED');
    expect(ficha.tickets[0]?.status).toBe('REFUNDED');
    expect(ficha.payments[0]?.status).toBe('REFUNDED');
    await expectAppError(
      refundOrder(auth, pedido.orderId, { reason: 'Segunda tentativa de reembolso' }, meta()),
      'CONFLICT',
    );
  });

  it('gerar novo link invalida o anterior', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const pedido = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }]);

    const { publicUrl } = await regenerateOrderLink(auth, pedido.orderId, meta());
    const novoToken = new URL(publicUrl).searchParams.get('t');
    expect(await getPublicOrder(publico.id, pedido.code, pedido.accessToken)).toBeNull();
    expect((await getPublicOrder(publico.id, pedido.code, novoToken))?.code).toBe(pedido.code);
  });

  it('cliente identificado pelo CPF, sem sobrescrever o cadastro', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const buyer = comprador({ name: 'Carla Menezes Rocha' });
    const primeiro = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }], { buyer });
    await simulateMockPayment({ orderId: primeiro.orderId, outcome: 'APPROVED' });
    await comprar(publico, dataFutura(12), [{ ticketTypeId: tipo.id, quantity: 1 }], {
      buyer: { ...buyer, name: 'Nome Digitado Por Outra Pessoa' },
    }).catch(() => undefined);

    const lista = await listCustomers(auth, { q: buyer.cpf });
    expect(lista.total).toBe(1);
    expect(lista.items[0]?.name).toBe('Carla Menezes Rocha');
    expect(lista.items[0]?.ordersCount).toBe(1);

    const ficha = await getCustomerDetail(auth, lista.items[0]?.id ?? '');
    expect(ficha.stats.totalSpentCents).toBe(7000);
    expect(ficha.cpfMasked).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
  });

  it('indicadores do período e valores escondidos de quem não vê o financeiro', async () => {
    const { publico, auth, parque } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const pedido = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 2 }]);
    await simulateMockPayment({ orderId: pedido.orderId, outcome: 'APPROVED' });

    const periodo = parsePeriod({ periodo: 'hoje' }, todayIn(publico.timezone));
    const painel = await getDashboard(auth, periodo);
    expect(painel.kpis.orders.value).toBe(1);
    expect(painel.kpis.tickets.value).toBe(2);
    expect(painel.kpis.revenue?.value).toBe(14000);
    expect(painel.kpis.newCustomers.value).toBe(1);
    expect(painel.series.reduce((soma, ponto) => soma + ponto.orders, 0)).toBe(1);
    expect(painel.byTicketType[0]).toMatchObject({ tickets: 2, revenueCents: 14000 });

    const bilheteria = await createUser({ parkId: parque.id, roles: ['BOX_OFFICE'] });
    const { auth: authBilheteria } = await authAs(bilheteria, parque.id);
    const semFinanceiro = await getDashboard(authBilheteria, periodo);
    expect(semFinanceiro.kpis.revenue).toBeNull();
    expect(semFinanceiro.kpis.orders.value).toBe(1);

    const marketing = await createUser({ parkId: parque.id, roles: ['MARKETING'] });
    const { auth: authMarketing } = await authAs(marketing, parque.id);
    await expectAppError(listOrders(authMarketing), 'FORBIDDEN');
  });

  it('calendário não fecha dia que já tem ingresso vendido', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data, 10);
    const tipo = await criarTipo(publico.id);
    const pedido = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }]);
    await simulateMockPayment({ orderId: pedido.orderId, outcome: 'APPROVED' });

    await expectAppError(
      saveCalendarDay(
        auth,
        data,
        {
          status: 'CLOSED',
          opensAt: null,
          closesAt: null,
          capacity: 10,
          dayKind: null,
          label: null,
          notes: null,
        },
        meta(),
      ),
      'CONFLICT',
    );
  });
});
