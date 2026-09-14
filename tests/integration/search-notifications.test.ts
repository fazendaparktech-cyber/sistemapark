import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { prisma } from '@/server/db';
import { reportEmailFailure } from '@/server/notifications/alerts';
import { listNotifications, markNotificationsRead } from '@/server/notifications/service';
import { applyChargeSnapshot, simulateMockPayment } from '@/server/payments/service';
import { placePosOrder } from '@/server/sales/pos';
import { globalSearch } from '@/server/search/service';

import { authAs, createUser, meta } from '../helpers/factories';
import { abrirDia, comprar, criarParqueDeVendas, criarTipo, novoCpf, proximoDiaUtil } from '../helpers/sales';

describe('avisos do painel', () => {
  it('valor diferente e pago sem ingresso avisam o financeiro uma única vez', async () => {
    const { parque, publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data, 1);
    const tipo = await criarTipo(publico.id);

    const atrasado = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }]);
    const passado = new Date(Date.now() - 60_000);
    await prisma.order.update({ where: { id: atrasado.orderId }, data: { expiresAt: passado } });
    await prisma.capacityHold.updateMany({
      where: { orderId: atrasado.orderId },
      data: { expiresAt: passado },
    });
    const noPrazo = await comprar(publico, data, [{ ticketTypeId: tipo.id, quantity: 1 }]);
    await simulateMockPayment({ orderId: noPrazo.orderId, outcome: 'APPROVED' });

    const cobranca = await prisma.payment.findFirstOrThrow({ where: { orderId: atrasado.orderId } });
    const aprovado = {
      providerPaymentId: cobranca.providerPaymentId ?? '',
      status: 'APPROVED' as const,
      refundedCents: 0,
      feeCents: null,
      paidAt: new Date(),
    };
    await applyChargeSnapshot(
      cobranca.id,
      { ...aprovado, amountCents: cobranca.amountCents - 100 },
      { kind: 'RECONCILED' },
    );
    await applyChargeSnapshot(
      cobranca.id,
      { ...aprovado, amountCents: cobranca.amountCents },
      { kind: 'RECONCILED' },
    );
    await applyChargeSnapshot(
      cobranca.id,
      { ...aprovado, amountCents: cobranca.amountCents },
      { kind: 'RECONCILED' },
    );

    const financeiro = await authAs(await createUser({ parkId: parque.id, roles: ['FINANCE'] }), parque.id);
    const avisos = await listNotifications(financeiro.auth);
    expect(avisos.items.map((aviso) => aviso.type).sort()).toEqual(['PAYMENT_PROBLEM', 'TICKET_EMISSION']);
    expect(avisos.unread).toBe(2);
    expect(avisos.items.find((aviso) => aviso.type === 'TICKET_EMISSION')).toMatchObject({
      severity: 'CRITICAL',
      href: `/admin/vendas/${atrasado.orderId}`,
      read: false,
    });

    const portaria = await authAs(await createUser({ parkId: parque.id, roles: ['GATE'] }), parque.id);
    expect((await listNotifications(portaria.auth)).items).toHaveLength(0);

    // Leitura é de cada pessoa.
    expect(await markNotificationsRead(financeiro.auth, { all: true })).toEqual({ unread: 0 });
    const doAdministrador = await listNotifications(auth);
    expect(
      doAdministrador.items.filter((aviso) => aviso.type !== 'CAPACITY').every((aviso) => !aviso.read),
    ).toBe(true);
  });

  it('e-mail que falhou vira aviso para quem pode reenviar, sem repetir', async () => {
    const { parque, publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data, 50);
    const tipo = await criarTipo(publico.id);
    const venda = await placePosOrder(
      auth,
      {
        visitDate: data,
        items: [{ ticketTypeId: tipo.id, quantity: 1 }],
        buyer: { name: 'Sofia Aviso Prado' },
        paymentMethod: 'CASH',
        idempotencyKey: randomUUID(),
      },
      meta(),
    );
    const pedido = await prisma.order.findUniqueOrThrow({ where: { id: venda.orderId } });

    await reportEmailFailure(prisma, pedido.id, 'CONFIRMED', new Error('Servidor de e-mail fora do ar'));
    await reportEmailFailure(prisma, pedido.id, 'CONFIRMED', new Error('Servidor de e-mail fora do ar'));

    const bilheteria = await authAs(
      await createUser({ parkId: parque.id, roles: ['BOX_OFFICE'] }),
      parque.id,
    );
    const avisos = (await listNotifications(bilheteria.auth)).items.filter(
      (aviso) => aviso.type === 'EMAIL_FAILURE',
    );
    expect(avisos).toEqual([
      expect.objectContaining({
        title: `E-mail não enviado: pedido ${pedido.code}`,
        href: `/admin/vendas/${pedido.id}`,
      }),
    ]);
  });
});

describe('busca do painel', () => {
  it('encontra cliente, venda e ingresso por nome, CPF, telefone e código, conforme a permissão', async () => {
    const { parque, publico, auth } = await criarParqueDeVendas();
    const data = proximoDiaUtil();
    await abrirDia(publico.id, data, 50);
    const tipo = await criarTipo(publico.id);
    const cpf = novoCpf();
    const venda = await placePosOrder(
      auth,
      {
        visitDate: data,
        items: [{ ticketTypeId: tipo.id, quantity: 1 }],
        buyer: { name: 'Heloísa Busca Tavares', cpf, phone: '(73) 98123-4567' },
        paymentMethod: 'CASH',
        idempotencyKey: randomUUID(),
      },
      meta(),
    );
    const pedido = await prisma.order.findUniqueOrThrow({
      where: { id: venda.orderId },
      include: { tickets: true },
    });
    const [ingresso] = pedido.tickets;
    if (!ingresso) throw new Error('Venda sem ingresso.');

    const porNome = await globalSearch(auth, 'heloísa busca');
    expect(porNome.customers?.map((cliente) => cliente.title)).toEqual(['Heloísa Busca Tavares']);
    expect(porNome.orders?.map((item) => item.title)).toEqual([pedido.code]);
    expect(porNome.tickets?.map((item) => item.href)).toEqual([`/admin/ingressos/${ingresso.id}`]);

    const porCpf = await globalSearch(auth, cpf);
    expect(porCpf.customers).toHaveLength(1);
    expect(porCpf.orders?.[0]?.id).toBe(pedido.id);

    expect((await globalSearch(auth, '73 98123-4567')).orders?.[0]?.id).toBe(pedido.id);
    expect((await globalSearch(auth, ingresso.code)).tickets?.[0]?.id).toBe(ingresso.id);
    expect((await globalSearch(auth, pedido.code)).orders?.[0]?.id).toBe(pedido.id);
    expect(await globalSearch(auth, 'h')).toMatchObject({ customers: [], orders: [], tickets: [] });

    const marketing = await authAs(await createUser({ parkId: parque.id, roles: ['MARKETING'] }), parque.id);
    expect(await globalSearch(marketing.auth, 'heloísa')).toMatchObject({
      customers: null,
      orders: null,
      tickets: null,
    });
  });
});
