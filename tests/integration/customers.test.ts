import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { addDays, todayIn } from '@/lib/dates';
import { checkInManually } from '@/server/checkin/service';
import { createCustomer, getCustomerDetail, listCustomers, updateCustomer } from '@/server/customers/service';
import { prisma } from '@/server/db';
import { placePosOrder } from '@/server/sales/pos';

import { authAs, createUser, expectAppError, lastAudit, meta } from '../helpers/factories';
import { abrirDia, criarParqueDeVendas, criarTipo, novoCpf } from '../helpers/sales';

describe('clientes', () => {
  it('cadastra cliente sem e-mail e recusa CPF já cadastrado', async () => {
    const { auth } = await criarParqueDeVendas();
    const cpf = novoCpf();

    const { id } = await createCustomer(
      auth,
      { name: 'Joana Balcão Pires', cpf, phone: '(73) 99888-1122', marketingOptIn: true },
      meta(),
    );
    const ficha = await getCustomerDetail(auth, id);
    expect(ficha).toMatchObject({
      name: 'Joana Balcão Pires',
      email: null,
      phone: '5573998881122',
      marketingOptIn: true,
    });
    expect(ficha.cpfMasked).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    expect(await lastAudit('customers.created', id)).toBeTruthy();

    await expectAppError(
      createCustomer(auth, { name: 'Outra Pessoa Qualquer', cpf, marketingOptIn: false }, meta()),
      'CONFLICT',
    );
  });

  it('o CPF pode ser incluído depois, mas não trocado nem repetido', async () => {
    const { auth } = await criarParqueDeVendas();
    const { id } = await createCustomer(
      auth,
      { name: 'Rafael Sem Documento', marketingOptIn: false },
      meta(),
    );
    const { id: outroId } = await createCustomer(
      auth,
      { name: 'Pessoa Com Documento', cpf: novoCpf(), marketingOptIn: false },
      meta(),
    );
    const cpfDoOutro = await prisma.customer.findUniqueOrThrow({ where: { id: outroId } });
    expect(cpfDoOutro.cpfHash).not.toBeNull();

    const cpf = novoCpf();
    const atualizado = await updateCustomer(
      auth,
      id,
      { name: 'Rafael Com Documento', cpf, marketingOptIn: false },
      meta(),
    );
    expect(atualizado.cpfMasked).not.toBeNull();
    await expectAppError(
      updateCustomer(
        auth,
        id,
        { name: 'Rafael Com Documento', cpf: novoCpf(), marketingOptIn: false },
        meta(),
      ),
      'VALIDATION_ERROR',
    );
    expect(
      (await updateCustomer(auth, id, { name: 'Rafael Silva', cpf, marketingOptIn: true }, meta())).name,
    ).toBe('Rafael Silva');
  });

  it('lista e ficha mostram visitas, total gasto, ticket médio, ingressos e próxima visita', async () => {
    const { auth, publico } = await criarParqueDeVendas();
    const hoje = todayIn('America/Bahia');
    const futura = addDays(hoje, 5);
    await abrirDia(publico.id, hoje);
    await abrirDia(publico.id, futura);
    const tipo = await criarTipo(publico.id, { basePriceCents: 5000 });
    const cpf = novoCpf();
    const vender = (data: string, quantidade: number) =>
      placePosOrder(
        auth,
        {
          visitDate: data,
          items: [{ ticketTypeId: tipo.id, quantity: quantidade }],
          buyer: { name: 'Cliente Frequente Souza', cpf },
          paymentMethod: 'CASH',
          idempotencyKey: randomUUID(),
        },
        meta(),
      );
    const deHoje = await vender(hoje, 2);
    await vender(futura, 1);
    const [ingresso] = await prisma.ticket.findMany({ where: { orderId: deHoje.orderId } });
    if (!ingresso) throw new Error('Venda sem ingressos.');
    await checkInManually(auth, { ticketId: ingresso.id }, meta());

    const lista = await listCustomers(auth, { q: cpf });
    expect(lista.items).toHaveLength(1);
    expect(lista.items[0]).toMatchObject({
      visitsCount: 1,
      ticketsCount: 3,
      ordersCount: 2,
      totalSpentCents: 15000,
      lastVisitDate: hoje,
      nextVisitDate: hoje,
    });

    const ficha = await getCustomerDetail(auth, lista.items[0]?.id ?? '');
    expect(ficha.stats).toMatchObject({ visitsCount: 1, averageOrderCents: 7500, lastVisitDate: hoje });
    expect(ficha.tickets).toHaveLength(3);
    expect(ficha.tickets.filter((item) => item.status === 'CHECKED_IN')).toHaveLength(1);
    expect(ficha.visits).toEqual([{ date: hoje, entries: 1, firstEntryAt: expect.any(Date) }]);
    expect(ficha.orders.map((pedido) => pedido.saleStatus)).toEqual(['PAID', 'PAID']);
  });

  it('bilheteria cadastra cliente; marketing não vê clientes', async () => {
    const { parque } = await criarParqueDeVendas();
    const bilheteria = await createUser({ parkId: parque.id, roles: ['BOX_OFFICE'] });
    const marketing = await createUser({ parkId: parque.id, roles: ['MARKETING'] });
    const { auth: authBilheteria } = await authAs(bilheteria, parque.id);
    const { auth: authMarketing } = await authAs(marketing, parque.id);

    await createCustomer(authBilheteria, { name: 'Cliente do Balcão', marketingOptIn: false }, meta());
    await expectAppError(listCustomers(authMarketing), 'FORBIDDEN');
    await expectAppError(
      createCustomer(authMarketing, { name: 'Não Pode Cadastrar', marketingOptIn: false }, meta()),
      'FORBIDDEN',
    );
  });
});
