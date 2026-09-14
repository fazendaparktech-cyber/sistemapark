import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { todayIn } from '@/lib/dates';
import { getAudienceProfile } from '@/server/customers/service';
import { prisma } from '@/server/db';
import { placePosOrder } from '@/server/sales/pos';

import { expectAppError, meta } from '../helpers/factories';
import { abrirDia, comprador, comprar, criarParqueDeVendas, criarTipo, dataFutura } from '../helpers/sales';

describe('perfil do público', () => {
  it('guarda cidade, UF e nascimento da compra pelo site e agrupa cidades, regiões e idades', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(5);
    await abrirDia(publico.id, data, 50);
    const tipo = await criarTipo(publico.id);
    const itens = [{ ticketTypeId: tipo.id, quantity: 1 }];
    const ano = Number(todayIn('America/Bahia').slice(0, 4));
    const nascido = (anos: number) => `${ano - anos}-01-01`;

    await comprar(publico, data, itens, {
      buyer: comprador({ city: 'salvador', state: 'ba', birthDate: nascido(22), phone: '(71) 98888-1111' }),
    });
    await comprar(publico, data, itens, {
      buyer: comprador({ city: ' Salvador ', state: 'BA', birthDate: nascido(30), phone: '(71) 97777-2222' }),
    });
    const santoAmaro = await comprar(publico, data, itens, {
      buyer: comprador({
        city: 'Santo Amaro',
        state: 'BA',
        birthDate: nascido(65),
        phone: '(75) 99999-3333',
      }),
    });
    await placePosOrder(
      auth,
      {
        visitDate: data,
        items: itens,
        buyer: { name: 'Paulo Balcão Rocha', phone: '(11) 91234-5678' },
        paymentMethod: 'CASH',
        idempotencyKey: randomUUID(),
      },
      meta(),
    );

    const pedido = await prisma.order.findUniqueOrThrow({
      where: { id: santoAmaro.orderId },
      include: { customer: true },
    });
    expect(pedido.customer).toMatchObject({ city: 'Santo Amaro', state: 'BA' });

    await expectAppError(
      comprar(publico, data, itens, { buyer: { ...comprador(), city: '' } }),
      'VALIDATION_ERROR',
    );

    const perfil = await getAudienceProfile(auth);
    expect(perfil.total).toBe(4);
    expect(perfil.cities).toEqual([
      { key: 'salvador|BA', label: 'Salvador - BA', value: 2 },
      { key: 'santo amaro|BA', label: 'Santo Amaro - BA', value: 1 },
      { key: 'sem-informacao', label: 'Sem informação', value: 1 },
    ]);
    expect(perfil.regions).toEqual([
      { key: 'Salvador e Região Metropolitana', label: 'Salvador e Região Metropolitana', value: 2 },
      { key: 'Feira de Santana e Recôncavo', label: 'Feira de Santana e Recôncavo', value: 1 },
      { key: 'Outros estados', label: 'Outros estados', value: 1 },
    ]);
    expect(perfil.ages).toEqual([
      { key: '18-24', label: '18 a 24 anos', value: 1 },
      { key: '25-34', label: '25 a 34 anos', value: 1 },
      { key: '60+', label: '60 anos ou mais', value: 1 },
      { key: 'sem-informacao', label: 'Sem informação', value: 1 },
    ]);
  });
});
