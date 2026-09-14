import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { todayIn } from '@/lib/dates';
import { parsePeriod } from '@/lib/periods';
import { prisma } from '@/server/db';
import { getMarketingOverview, recordPublicTrackingEvent } from '@/server/marketing/service';
import { simulateMockPayment } from '@/server/payments/service';
import { createCart } from '@/server/sales/cart';
import { placeOnlineOrder } from '@/server/sales/checkout';
import { placePosOrder, simulatePosPix } from '@/server/sales/pos';
import { getMarketingSettings, updateMarketingSettings } from '@/server/settings/service';

import { authAs, createUser, expectAppError, lastAudit, meta } from '../helpers/factories';
import { abrirDia, comprador, criarParqueDeVendas, criarTipo, dataFutura } from '../helpers/sales';

const FUSO = 'America/Bahia';

function periodoDeHoje() {
  return parsePeriod({ periodo: 'hoje', de: null, ate: null }, todayIn(FUSO), 'mes');
}

describe('funil de compra', () => {
  it('registra cada passo uma vez e liga a compra ao navegador e à campanha', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(4);
    await abrirDia(publico.id, data, 50);
    const tipo = await criarTipo(publico.id, { basePriceCents: 7000 });
    const visitante = randomUUID();
    const origem = { utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'ferias-de-julho' };

    const ver = { type: 'VIEW_TICKETS', visitorId: visitante, attribution: origem };
    expect(await recordPublicTrackingEvent(publico.id, ver, meta())).toEqual({ recorded: true });
    expect(await recordPublicTrackingEvent(publico.id, ver, meta())).toEqual({ recorded: false });
    await recordPublicTrackingEvent(publico.id, { type: 'VIEW_TICKETS', visitorId: randomUUID() }, meta());
    expect(
      await recordPublicTrackingEvent(
        publico.id,
        { type: 'CHECKOUT_STARTED', visitorId: visitante, valueCents: 14000, attribution: origem },
        meta(),
      ),
    ).toEqual({ recorded: true });

    // Compra e pagamento só o servidor registra.
    await expectAppError(
      recordPublicTrackingEvent(publico.id, { type: 'PURCHASE', visitorId: visitante }, meta()),
      'VALIDATION_ERROR',
    );
    await expectAppError(
      recordPublicTrackingEvent(publico.id, { type: 'VIEW_TICKETS', visitorId: 'curto' }, meta()),
      'VALIDATION_ERROR',
    );

    const { token } = await createCart({
      park: publico,
      selection: { date: data, items: [{ ticketTypeId: tipo.id, quantity: 2 }] },
      previousToken: null,
      meta: meta(),
    });
    const pedido = await placeOnlineOrder({
      park: publico,
      cartToken: token,
      data: {
        buyer: comprador(),
        holders: [],
        couponCode: null,
        marketingOptIn: false,
        acceptTerms: true,
        idempotencyKey: randomUUID(),
        attribution: origem,
        visitorId: visitante,
      },
      meta: meta(),
    });
    expect(await prisma.trackingEvent.findMany({ where: { orderId: pedido.orderId } })).toEqual([
      expect.objectContaining({
        type: 'PAYMENT_STARTED',
        visitorId: visitante,
        valueCents: 14000,
        utmSource: 'instagram',
        utmCampaign: 'ferias-de-julho',
      }),
    ]);

    expect(await simulateMockPayment({ orderId: pedido.orderId, outcome: 'APPROVED' })).toBe('processed');
    const eventos = await prisma.trackingEvent.findMany({
      where: { orderId: pedido.orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(eventos.map((evento) => evento.type)).toEqual(['PAYMENT_STARTED', 'PURCHASE']);
    expect(eventos[1]).toMatchObject({ visitorId: visitante, valueCents: 14000 });

    // Venda no balcão paga por PIX não entra no funil do site.
    const balcao = await placePosOrder(
      auth,
      {
        visitDate: data,
        items: [{ ticketTypeId: tipo.id, quantity: 1 }],
        buyer: { name: 'Clara Balcão Nunes' },
        paymentMethod: 'PIX',
        idempotencyKey: randomUUID(),
      },
      meta(),
    );
    await simulatePosPix(auth, balcao.orderId, 'APPROVED');
    expect(await prisma.trackingEvent.count({ where: { orderId: balcao.orderId } })).toBe(0);

    const painel = await getMarketingOverview(auth, periodoDeHoje());
    expect(painel.funnel).toEqual({
      views: 2,
      checkouts: 1,
      payments: 1,
      purchases: 1,
      purchaseValueCents: 14000,
    });
    expect(painel.byOrigin).toEqual([
      expect.objectContaining({ origin: 'INSTAGRAM', views: 1, checkouts: 1, purchases: 1, conversion: 1 }),
      expect.objectContaining({ origin: 'DIRECT', views: 1, purchases: 0, conversion: 0 }),
    ]);
    expect(painel.campaigns).toEqual([
      expect.objectContaining({
        campaign: 'ferias-de-julho',
        source: 'instagram',
        medium: 'social',
        views: 1,
        purchases: 1,
      }),
    ]);
    expect(painel.sales).toEqual([
      expect.objectContaining({ origin: 'INSTAGRAM', orders: 1, tickets: 2, valueCents: 14000 }),
      expect.objectContaining({ origin: 'POS', orders: 1, tickets: 1 }),
    ]);
  });
});

describe('pixels de marketing', () => {
  it('marketing configura os pixels com validação e quem não gerencia não altera', async () => {
    const { parque } = await criarParqueDeVendas();
    const marketing = await authAs(await createUser({ parkId: parque.id, roles: ['MARKETING'] }), parque.id);

    await expectAppError(
      updateMarketingSettings(
        marketing.auth,
        { metaPixelId: 'abc', googleAdsPurchaseLabel: 'AbCdEf123' },
        meta(),
      ),
      'VALIDATION_ERROR',
    );
    const salvo = await updateMarketingSettings(
      marketing.auth,
      {
        metaPixelId: ' 123456789012345 ',
        tiktokPixelId: 'c4abcdefgh1234567890',
        googleAnalyticsId: 'g-abc123def4',
        googleAdsId: 'aw-123456789',
        googleAdsPurchaseLabel: 'AbC-dEfGhIjK',
      },
      meta(),
    );
    expect(salvo).toEqual({
      metaPixelId: '123456789012345',
      tiktokPixelId: 'C4ABCDEFGH1234567890',
      googleAnalyticsId: 'G-ABC123DEF4',
      googleAdsId: 'AW-123456789',
      googleAdsPurchaseLabel: 'AbC-dEfGhIjK',
    });
    expect(await getMarketingSettings(parque.id)).toEqual(salvo);
    expect(await lastAudit('marketing.settings_updated', 'marketing')).toMatchObject({
      parkId: parque.id,
      actorUserId: marketing.auth.user.id,
    });

    const bilheteria = await authAs(
      await createUser({ parkId: parque.id, roles: ['BOX_OFFICE'] }),
      parque.id,
    );
    await expectAppError(
      updateMarketingSettings(bilheteria.auth, { metaPixelId: null }, meta()),
      'FORBIDDEN',
    );
    await expectAppError(getMarketingOverview(bilheteria.auth, periodoDeHoje()), 'FORBIDDEN');

    // Marketing vê o funil, sem valores em dinheiro.
    expect((await getMarketingOverview(marketing.auth, periodoDeHoje())).showValues).toBe(false);
  });
});
