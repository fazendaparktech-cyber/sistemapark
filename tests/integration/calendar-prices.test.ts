import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import { getDayPricing, saveDaySpecialPrices } from '@/server/calendar/service';
import { prisma } from '@/server/db';
import { getPosOffer, placePosOrder } from '@/server/sales/pos';

import { authAs, createUser, expectAppError, lastAudit, meta } from '../helpers/factories';
import { abrirDia, criarParqueDeVendas, criarTipo, dataFutura } from '../helpers/sales';

describe('calendário: preço especial do dia', () => {
  it('vale só na data, vence as outras regras e pode ser alterado e removido', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(8);
    const outra = addDays(data, 1);
    await abrirDia(publico.id, data);
    await abrirDia(publico.id, outra);
    const tipo = await criarTipo(publico.id, { basePriceCents: 7000 });
    await prisma.ticketPrice.create({
      data: { ticketTypeId: tipo.id, name: 'Regra de temporada', priceCents: 6500, priority: 100 },
    });

    const precos = await saveDaySpecialPrices(
      auth,
      data,
      { prices: [{ ticketTypeId: tipo.id, priceCents: 9900 }] },
      meta(),
    );
    expect(precos.find((item) => item.ticketTypeId === tipo.id)).toMatchObject({
      specialPriceCents: 9900,
      currentPriceCents: 9900,
      currentLabel: 'Preço especial do dia',
    });
    expect((await getDayPricing(auth, outra))[0]).toMatchObject({
      specialPriceCents: null,
      currentPriceCents: 6500,
    });
    expect((await getPosOffer(auth, data)).ticketTypes[0]?.priceCents).toBe(9900);
    expect(await lastAudit('calendar.special_prices_updated', data)).toBeTruthy();

    await saveDaySpecialPrices(auth, data, { prices: [{ ticketTypeId: tipo.id, priceCents: 8800 }] }, meta());
    expect(await prisma.ticketPrice.count({ where: { ticketTypeId: tipo.id, kind: 'SPECIAL_DATE' } })).toBe(
      1,
    );
    expect((await getDayPricing(auth, data))[0]?.currentPriceCents).toBe(8800);

    const semEspecial = await saveDaySpecialPrices(
      auth,
      data,
      { prices: [{ ticketTypeId: tipo.id, priceCents: null }] },
      meta(),
    );
    expect(semEspecial[0]).toMatchObject({ specialPriceCents: null, currentPriceCents: 6500 });
    expect(await prisma.ticketPrice.count({ where: { ticketTypeId: tipo.id, kind: 'SPECIAL_DATE' } })).toBe(
      0,
    );
  });

  it('bilheteria vê os preços do dia, mas só quem gerencia o calendário altera', async () => {
    const { parque, publico } = await criarParqueDeVendas();
    const data = dataFutura(8);
    await abrirDia(publico.id, data);
    const tipo = await criarTipo(publico.id);
    const bilheteria = await createUser({ parkId: parque.id, roles: ['BOX_OFFICE'] });
    const { auth } = await authAs(bilheteria, parque.id);

    expect(await getDayPricing(auth, data)).toHaveLength(1);
    await expectAppError(
      saveDaySpecialPrices(auth, data, { prices: [{ ticketTypeId: tipo.id, priceCents: 100 }] }, meta()),
      'FORBIDDEN',
    );
  });
});

describe('calendário: avisos de lotação', () => {
  it('avisa em 80%, 90% e 100% da capacidade, uma vez cada', async () => {
    const { parque, publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(6);
    await abrirDia(publico.id, data, 10);
    const tipo = await criarTipo(publico.id);
    const vender = (quantidade: number) =>
      placePosOrder(
        auth,
        {
          visitDate: data,
          items: [{ ticketTypeId: tipo.id, quantity: quantidade }],
          buyer: { name: 'Cliente da Lotação' },
          paymentMethod: 'CASH',
          idempotencyKey: randomUUID(),
        },
        meta(),
      );
    const avisos = () =>
      prisma.notification.findMany({
        where: { parkId: parque.id, type: 'CAPACITY' },
        orderBy: { createdAt: 'asc' },
        select: { dedupeKey: true, severity: true },
      });

    await vender(7);
    expect(await avisos()).toEqual([]);
    await vender(1);
    await vender(1);
    await vender(1);
    expect(await avisos()).toEqual([
      { dedupeKey: `lotacao:${data}:80`, severity: 'WARNING' },
      { dedupeKey: `lotacao:${data}:90`, severity: 'WARNING' },
      { dedupeKey: `lotacao:${data}:100`, severity: 'CRITICAL' },
    ]);
  });
});
