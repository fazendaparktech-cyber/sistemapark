import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { PosSaleInput } from '@/lib/orders';
import { prisma } from '@/server/db';
import { getOrderAdmin, listOrders, refundOrder } from '@/server/orders/admin';
import {
  getPosOffer,
  getPosSaleStatus,
  placePosOrder,
  quotePosSale,
  simulatePosPix,
} from '@/server/sales/pos';

import { authAs, createUser, expectAppError, meta } from '../helpers/factories';
import { abrirDia, comprar, criarParqueDeVendas, criarTipo, dataFutura, novoCpf } from '../helpers/sales';

function venda(
  data: string,
  itens: { ticketTypeId: string; quantity: number }[],
  extra: Partial<PosSaleInput> = {},
): PosSaleInput {
  return {
    visitDate: data,
    items: itens,
    buyer: { name: 'João Balcão Souza' },
    paymentMethod: 'CASH',
    idempotencyKey: randomUUID(),
    ...extra,
  };
}

describe('venda presencial', () => {
  it('dinheiro confirma na hora, calcula o troco e registra o pagamento recebido pela equipe', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(5);
    await abrirDia(publico.id, data, 50);
    const tipo = await criarTipo(publico.id, { basePriceCents: 6000 });

    const resultado = await placePosOrder(
      auth,
      venda(data, [{ ticketTypeId: tipo.id, quantity: 3 }], { cashReceivedCents: 20000 }),
      meta(),
    );
    expect(resultado).toMatchObject({ status: 'CONFIRMED', totalCents: 18000, changeCents: 2000, pix: null });

    const pedido = await prisma.order.findUniqueOrThrow({
      where: { id: resultado.orderId },
      include: { payments: true, tickets: true },
    });
    expect(pedido).toMatchObject({
      channel: 'POS',
      soldById: auth.user.id,
      financialStatus: 'PAID',
      buyerEmail: null,
      customerId: null,
    });
    expect(pedido.payments).toHaveLength(1);
    expect(pedido.payments[0]).toMatchObject({
      provider: 'MANUAL',
      method: 'CASH',
      status: 'APPROVED',
      amountCents: 18000,
    });
    expect(pedido.tickets.map((ingresso) => ingresso.status)).toEqual(['ACTIVE', 'ACTIVE', 'ACTIVE']);

    const lista = await listOrders(auth, { status: 'PAID', payment: 'CASH' });
    const linha = lista.items.find((item) => item.id === resultado.orderId);
    expect(linha).toMatchObject({ saleStatus: 'PAID', paymentMethod: 'CASH', channel: 'POS' });
    expect((await listOrders(auth, { payment: 'PIX' })).items.map((item) => item.id)).not.toContain(
      resultado.orderId,
    );
  });

  it('repetir o envio não cria outra venda', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(5);
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const dados = venda(data, [{ ticketTypeId: tipo.id, quantity: 1 }]);

    const primeira = await placePosOrder(auth, dados, meta());
    const segunda = await placePosOrder(auth, dados, meta());
    expect(segunda.orderId).toBe(primeira.orderId);
    expect(await prisma.order.count({ where: { parkId: publico.id } })).toBe(1);
  });

  it('nunca vende acima da lotação, somando o site e o balcão', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(6);
    await abrirDia(publico.id, data, 5);
    const tipo = await criarTipo(publico.id);

    await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 3 }]);
    await expectAppError(
      placePosOrder(auth, venda(data, [{ ticketTypeId: tipo.id, quantity: 3 }]), meta()),
      'SOLD_OUT',
    );
    await placePosOrder(auth, venda(data, [{ ticketTypeId: tipo.id, quantity: 2 }]), meta());

    const oferta = await getPosOffer(auth, data);
    expect(oferta.day?.available).toBe(0);
    expect(oferta.blocker).toBe('Não há mais vagas para esta data.');
  });

  it('vendas simultâneas não passam da lotação', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(7);
    await abrirDia(publico.id, data, 4);
    const tipo = await criarTipo(publico.id);

    const tentativas = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        placePosOrder(auth, venda(data, [{ ticketTypeId: tipo.id, quantity: 2 }]), meta()),
      ),
    );
    expect(tentativas.filter((tentativa) => tentativa.status === 'fulfilled')).toHaveLength(2);
    expect(await prisma.ticket.count({ where: { parkId: publico.id, status: 'ACTIVE' } })).toBe(4);
  });

  it('desconto manual exige permissão e motivo', async () => {
    const { parque, publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(5);
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id, { basePriceCents: 5000 });
    const itens = [{ ticketTypeId: tipo.id, quantity: 2 }];

    const bilheteria = await createUser({ parkId: parque.id, roles: ['BOX_OFFICE'] });
    const { auth: authBilheteria } = await authAs(bilheteria, parque.id);
    await expectAppError(
      placePosOrder(
        authBilheteria,
        venda(data, itens, { manualDiscountCents: 1000, discountReason: 'Aniversário' }),
        meta(),
      ),
      'FORBIDDEN',
    );
    await expectAppError(
      placePosOrder(auth, venda(data, itens, { manualDiscountCents: 1000 }), meta()),
      'VALIDATION_ERROR',
    );
    await expectAppError(
      placePosOrder(
        auth,
        venda(data, itens, { manualDiscountCents: 20000, discountReason: 'Teste' }),
        meta(),
      ),
      'VALIDATION_ERROR',
    );

    const comDesconto = await placePosOrder(
      auth,
      venda(data, itens, { manualDiscountCents: 1000, discountReason: 'Aniversariante do dia' }),
      meta(),
    );
    expect(comDesconto.totalCents).toBe(9000);
    const pedido = await prisma.order.findUniqueOrThrow({ where: { id: comDesconto.orderId } });
    expect(pedido).toMatchObject({ discountCents: 1000, authorizedById: auth.user.id });
  });

  it('PIX no balcão reserva as vagas e confirma quando o pagamento entra', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(5);
    await abrirDia(publico.id, data, 10);
    const tipo = await criarTipo(publico.id);

    const resultado = await placePosOrder(
      auth,
      venda(data, [{ ticketTypeId: tipo.id, quantity: 2 }], {
        paymentMethod: 'PIX',
        buyer: { name: 'Ana Pix Oliveira', phone: '(73) 98888-7777' },
      }),
      meta(),
    );
    expect(resultado.status).toBe('PENDING_PAYMENT');
    expect(resultado.pix?.payload).toBeTruthy();
    expect(resultado.pix?.qrSvg).toContain('<svg');
    expect((await getPosOffer(auth, data)).day?.available).toBe(8);

    const pago = await simulatePosPix(auth, resultado.orderId, 'APPROVED');
    expect(pago.status).toBe('CONFIRMED');
    expect(pago.pix).toBeNull();
    expect(await prisma.ticket.count({ where: { orderId: resultado.orderId, status: 'ACTIVE' } })).toBe(2);
    expect((await getPosSaleStatus(auth, resultado.orderId)).status).toBe('CONFIRMED');
  });

  it('cliente pelo CPF é reaproveitado; sem CPF, pelo celular com o mesmo nome', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(5);
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const itens = [{ ticketTypeId: tipo.id, quantity: 1 }];
    const cpf = novoCpf();

    const porCpf1 = await placePosOrder(
      auth,
      venda(data, itens, { buyer: { name: 'Carlos Alberto Lima', cpf } }),
      meta(),
    );
    const porCpf2 = await placePosOrder(
      auth,
      venda(data, itens, { buyer: { name: 'Carlos A. Lima', cpf } }),
      meta(),
    );
    const clienteDe = async (orderId: string) =>
      (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).customerId;
    expect(await clienteDe(porCpf1.orderId)).not.toBeNull();
    expect(await clienteDe(porCpf2.orderId)).toBe(await clienteDe(porCpf1.orderId));

    const telefone = '(73) 97777-6666';
    const mae = await placePosOrder(
      auth,
      venda(data, itens, { buyer: { name: 'Beatriz Souza', phone: telefone } }),
      meta(),
    );
    const maeDeNovo = await placePosOrder(
      auth,
      venda(data, itens, { buyer: { name: 'beatriz souza', phone: telefone } }),
      meta(),
    );
    const filho = await placePosOrder(
      auth,
      venda(data, itens, { buyer: { name: 'Pedro Souza', phone: telefone } }),
      meta(),
    );
    expect(await clienteDe(maeDeNovo.orderId)).toBe(await clienteDe(mae.orderId));
    expect(await clienteDe(filho.orderId)).not.toBe(await clienteDe(mae.orderId));
  });

  it('reembolso de venda em dinheiro é devolvido no balcão, sem provedor', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(5);
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const resultado = await placePosOrder(
      auth,
      venda(data, [{ ticketTypeId: tipo.id, quantity: 2 }], { paymentMethod: 'DEBIT_CARD' }),
      meta(),
    );

    const antes = await getOrderAdmin(auth, resultado.orderId);
    expect(antes).toMatchObject({ manualPayment: true, saleStatus: 'PAID' });
    expect(antes.actions.canRefund).toBe(true);

    const depois = await refundOrder(auth, resultado.orderId, { reason: 'Cliente desistiu na hora' }, meta());
    expect(depois.saleStatus).toBe('REFUNDED');
    expect(depois.payments[0]).toMatchObject({ status: 'REFUNDED', refundedCents: 14000 });
    expect(depois.tickets.every((ingresso) => ingresso.status === 'REFUNDED')).toBe(true);
  });

  it('prévia mostra valores e avisa do cupom inválido sem travar', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(5);
    await abrirDia(publico.id, data, 30);
    const tipo = await criarTipo(publico.id, { basePriceCents: 4500 });

    const previa = await quotePosSale(auth, {
      visitDate: data,
      items: [{ ticketTypeId: tipo.id, quantity: 4 }],
      couponCode: 'NAOEXISTE',
    });
    expect(previa).toMatchObject({ subtotalCents: 18000, totalCents: 18000, available: 30, people: 4 });
    expect(previa.couponError).toBeTruthy();
  });

  it('dados do visitante são opcionais no balcão, mas conferidos quando informados', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(5);
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id, { holderData: 'NAME_CPF' });
    const itens = [{ ticketTypeId: tipo.id, quantity: 1 }];

    const semDados = await placePosOrder(auth, venda(data, itens), meta());
    expect(
      (await prisma.ticket.findFirstOrThrow({ where: { orderId: semDados.orderId } })).holderName,
    ).toBeNull();

    await expectAppError(
      placePosOrder(
        auth,
        venda(data, itens, {
          holders: [{ ticketTypeId: tipo.id, name: 'Lucas Visitante', cpf: '111.111.111-11' }],
        }),
        meta(),
      ),
      'VALIDATION_ERROR',
    );
  });
});
