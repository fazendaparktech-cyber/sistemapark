import { describe, expect, it } from 'vitest';

import { dateOnlyToDb } from '@/lib/dates';
import { saveSimplePricing } from '@/server/catalog/service';
import { prisma } from '@/server/db';
import { getPosOffer } from '@/server/sales/pos';

import { authAs, createUser, expectAppError, lastAudit, meta } from '../helpers/factories';
import {
  abrirDia,
  criarParqueDeVendas,
  criarTipo,
  dataFutura,
  proximoDiaUtil,
  proximoSabado,
} from '../helpers/sales';

describe('preços simples do tipo de ingresso', () => {
  it('semana, fim de semana, feriado e promoção valem nas datas certas', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const tipo = await criarTipo(publico.id, { basePriceCents: 7000 });
    const util = proximoDiaUtil(3);
    const sabado = proximoSabado(3);
    const feriado = proximoDiaUtil(20);
    for (const data of [util, sabado, feriado]) await abrirDia(publico.id, data);
    await prisma.parkDay.update({
      where: { parkId_date: { parkId: publico.id, date: dateOnlyToDb(feriado) } },
      data: { dayKind: 'HOLIDAY' },
    });
    const oferta = async (data: string) => (await getPosOffer(auth, data)).ticketTypes[0];

    const salvo = await saveSimplePricing(
      auth,
      tipo.id,
      { basePriceCents: 6000, weekendPriceCents: 8000, holidayPriceCents: 9000, promo: null },
      meta(),
    );
    expect(salvo).toMatchObject({
      basePriceCents: 6000,
      simplePricing: { weekendPriceCents: 8000, holidayPriceCents: 9000, promo: null },
    });
    expect((await oferta(util))?.priceCents).toBe(6000);
    expect((await oferta(sabado))?.priceCents).toBe(8000);
    expect((await oferta(feriado))?.priceCents).toBe(9000);
    expect(await lastAudit('prices.simple_updated', tipo.id)).toBeTruthy();

    const comPromocao = await saveSimplePricing(
      auth,
      tipo.id,
      {
        basePriceCents: 6000,
        weekendPriceCents: 8000,
        holidayPriceCents: null,
        promo: { priceCents: 5000, from: null, until: null },
      },
      meta(),
    );
    expect(comPromocao.simplePricing).toMatchObject({
      holidayPriceCents: null,
      promo: { priceCents: 5000, active: true },
    });
    expect(await oferta(util)).toMatchObject({ priceCents: 5000, compareAtCents: 6000 });
    expect(await prisma.ticketPrice.count({ where: { ticketTypeId: tipo.id, kind: 'HOLIDAY' } })).toBe(0);

    await saveSimplePricing(
      auth,
      tipo.id,
      {
        basePriceCents: 6000,
        weekendPriceCents: null,
        holidayPriceCents: null,
        promo: { priceCents: 5000, from: dataFutura(30), until: null },
      },
      meta(),
    );
    expect((await oferta(util))?.priceCents).toBe(6000);
    expect((await oferta(sabado))?.priceCents).toBe(6000);
    expect(
      await prisma.ticketPrice.count({
        where: { ticketTypeId: tipo.id, kind: { in: ['WEEKEND', 'PROMO'] } },
      }),
    ).toBe(1);
  });

  it('valor promocional precisa ser menor que o normal e só quem gerencia altera', async () => {
    const { parque, publico, auth } = await criarParqueDeVendas();
    const tipo = await criarTipo(publico.id);
    await expectAppError(
      saveSimplePricing(
        auth,
        tipo.id,
        {
          basePriceCents: 6000,
          weekendPriceCents: null,
          holidayPriceCents: null,
          promo: { priceCents: 6000, from: null, until: null },
        },
        meta(),
      ),
      'VALIDATION_ERROR',
    );

    const bilheteria = await createUser({ parkId: parque.id, roles: ['BOX_OFFICE'] });
    const { auth: authBilheteria } = await authAs(bilheteria, parque.id);
    await expectAppError(
      saveSimplePricing(
        authBilheteria,
        tipo.id,
        { basePriceCents: 100, weekendPriceCents: null, holidayPriceCents: null, promo: null },
        meta(),
      ),
      'FORBIDDEN',
    );
  });
});
