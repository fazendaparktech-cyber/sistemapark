import { randomUUID } from 'node:crypto';

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { addDays, todayIn } from '@/lib/dates';
import type { PosSaleInput } from '@/lib/orders';
import { parsePeriod } from '@/lib/periods';
import { checkInManually } from '@/server/checkin/service';
import { prisma } from '@/server/db';
import { getFinanceSummary } from '@/server/finance/service';
import { refundOrder } from '@/server/orders/admin';
import { exportReport, runReport } from '@/server/reports/service';
import { placePosOrder, simulatePosPix } from '@/server/sales/pos';

import { authAs, createUser, expectAppError, lastAudit, meta } from '../helpers/factories';
import { abrirDia, criarParqueDeVendas, criarTipo, dataFutura, novoCpf } from '../helpers/sales';

const FUSO = 'America/Bahia';

function venda(
  data: string,
  ticketTypeId: string,
  quantidade: number,
  extra: Partial<PosSaleInput> = {},
): PosSaleInput {
  return {
    visitDate: data,
    items: [{ ticketTypeId, quantity: quantidade }],
    buyer: { name: 'Rita Relatório Costa' },
    paymentMethod: 'CASH',
    idempotencyKey: randomUUID(),
    ...extra,
  };
}

function periodoDeHoje() {
  return parsePeriod({ periodo: 'hoje', de: null, ate: null }, todayIn(FUSO), 'mes');
}

describe('financeiro', () => {
  it('separa receita bruta, reembolsos, taxas e líquida por forma de pagamento', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const data = dataFutura(3);
    await abrirDia(publico.id, data, 50);
    const tipo = await criarTipo(publico.id, { basePriceCents: 6000 });

    await placePosOrder(auth, venda(data, tipo.id, 2, { cashReceivedCents: 12000 }), meta());
    const cartao = await placePosOrder(
      auth,
      venda(data, tipo.id, 1, { paymentMethod: 'DEBIT_CARD' }),
      meta(),
    );
    const pix = await placePosOrder(
      auth,
      venda(data, tipo.id, 1, {
        paymentMethod: 'PIX',
        buyer: { name: 'Paulo Pix Andrade', phone: '(73) 98888-1234' },
      }),
      meta(),
    );
    await simulatePosPix(auth, pix.orderId, 'APPROVED');
    await prisma.payment.updateMany({
      where: { orderId: pix.orderId, status: 'APPROVED' },
      data: { feeCents: 99 },
    });
    await refundOrder(auth, cartao.orderId, { reason: 'Cliente desistiu na hora' }, meta());

    const resumo = await getFinanceSummary(auth, periodoDeHoje());
    expect(resumo.gross.value).toBe(24000);
    expect(resumo.refunds.value).toBe(6000);
    expect(resumo.fees.value).toBe(99);
    expect(resumo.net.value).toBe(17901);
    expect(resumo.paidOrders.value).toBe(2);
    expect(resumo.paidAmount.value).toBe(18000);
    expect(resumo.pending.orders).toBe(0);

    const grupo = (chave: string) => resumo.byGroup.find((item) => item.group === chave);
    expect(grupo('CASH')).toMatchObject({ payments: 1, grossCents: 12000, refundsCents: 0, netCents: 12000 });
    expect(grupo('CARD')).toMatchObject({ payments: 1, grossCents: 6000, refundsCents: 6000, netCents: 0 });
    expect(grupo('PIX')).toMatchObject({ payments: 1, grossCents: 6000, feesCents: 99, netCents: 5901 });
    expect(grupo('OTHER')).toMatchObject({ payments: 0, grossCents: 0, netCents: 0 });
    expect(resumo.recentRefunds).toEqual([
      expect.objectContaining({ orderId: cartao.orderId, method: 'DEBIT_CARD', amountCents: 6000 }),
    ]);
    expect(resumo.daily.find((dia) => dia.date === todayIn(FUSO))).toMatchObject({
      paidOrders: 2,
      grossCents: 24000,
      refundsCents: 6000,
      feesCents: 99,
      netCents: 17901,
    });

    const faturamento = await runReport(auth, 'faturamento', periodoDeHoje());
    expect(faturamento.rows).toEqual([
      expect.objectContaining({
        data: todayIn(FUSO),
        vendas: 2,
        bruto: 24000,
        reembolsos: 6000,
        liquido: 17901,
      }),
    ]);

    const pagamentos = await runReport(auth, 'pagamentos', periodoDeHoje());
    expect(pagamentos.rows).toHaveLength(3);
    expect(pagamentos.rows[0]).toMatchObject({ bruto: 12000, participacao: 0.5 });
    expect(pagamentos.totals).toMatchObject({
      pagamentos: 3,
      bruto: 24000,
      reembolsos: 6000,
      taxas: 99,
      liquido: 17901,
      participacao: 1,
    });

    const vendas = await runReport(auth, 'vendas', periodoDeHoje());
    expect(vendas.rows.map((linha) => linha.situacao).sort()).toEqual(['Pago', 'Pago', 'Reembolsado']);
    expect(vendas.rows.every((linha) => linha.origem === 'Balcão')).toBe(true);
    expect(vendas.totals).toMatchObject({ pedido: '2 vendas pagas', ingressos: 3, total: 18000 });
  });
});

describe('relatórios', () => {
  it('ingressos, visitantes, check-ins, clientes, cupons e origem refletem o movimento do parque', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const hoje = todayIn(FUSO);
    const amanha = addDays(hoje, 1);
    await abrirDia(publico.id, hoje, 40);
    await abrirDia(publico.id, amanha, 20);
    const tipo = await criarTipo(publico.id, { basePriceCents: 5000 });
    await prisma.coupon.create({
      data: { parkId: publico.id, code: 'VERAO10', discountType: 'PERCENT', percentBps: 1000 },
    });

    const comCupom = await placePosOrder(
      auth,
      venda(hoje, tipo.id, 2, {
        couponCode: 'VERAO10',
        buyer: { name: 'Lúcia Cupom Ferreira', cpf: novoCpf() },
      }),
      meta(),
    );
    const deAmanha = await placePosOrder(auth, venda(amanha, tipo.id, 3), meta());

    const primeiro = await prisma.ticket.findFirstOrThrow({
      where: { orderId: comCupom.orderId },
      orderBy: { code: 'asc' },
    });
    await checkInManually(auth, { ticketId: primeiro.id, device: 'Celular da portaria' }, meta());
    await checkInManually(auth, { ticketId: primeiro.id }, meta());

    const visitas = parsePeriod({ periodo: 'personalizado', de: hoje, ate: amanha }, hoje, 'mes');

    const ingressos = await runReport(auth, 'ingressos', visitas);
    expect(ingressos.rows).toHaveLength(5);
    expect(ingressos.rows.find((linha) => linha.codigo === primeiro.code)).toMatchObject({
      visita: hoje,
      situacao: 'Utilizado',
      valor: primeiro.priceCents,
    });
    expect(ingressos.rows.filter((linha) => linha.situacao === 'Ativo')).toHaveLength(4);
    expect(ingressos.totals).toMatchObject({ codigo: '5 ingressos válidos' });

    const visitantes = await runReport(auth, 'visitantes', visitas);
    expect(visitantes.rows).toEqual([
      expect.objectContaining({
        data: hoje,
        capacidade: 40,
        vendidos: 2,
        disponiveis: 38,
        esperados: 2,
        entradas: 1,
        comparecimento: 0.5,
        noShow: null,
      }),
      expect.objectContaining({
        data: amanha,
        capacidade: 20,
        vendidos: 3,
        esperados: 3,
        entradas: 0,
        comparecimento: null,
        noShow: null,
      }),
    ]);
    expect(visitantes.totals).toMatchObject({
      capacidade: 60,
      vendidos: 5,
      entradas: 1,
      comparecimento: 0.5,
    });

    const checkins = await runReport(auth, 'checkins', periodoDeHoje());
    expect(checkins.rows).toEqual([
      expect.objectContaining({ resultado: 'Entrada liberada', motivo: null, ingresso: primeiro.code }),
      expect.objectContaining({ resultado: 'Entrada negada', motivo: 'Ingresso já utilizado' }),
    ]);
    expect(checkins.totals).toMatchObject({ horario: '1 liberada', resultado: '1 negada' });

    const clientes = await runReport(auth, 'clientes', periodoDeHoje());
    expect(clientes.rows).toEqual([
      expect.objectContaining({
        cliente: 'Lúcia Cupom Ferreira',
        perfil: 'Novo',
        compras: 1,
        gasto: 9000,
        ingressos: 2,
        visitas: 1,
      }),
    ]);

    const cupons = await runReport(auth, 'cupons', periodoDeHoje());
    expect(cupons.rows).toEqual([
      expect.objectContaining({
        cupom: 'VERAO10',
        usos: 1,
        desconto: 1000,
        vendas: 9000,
        ingressos: 2,
        usosTotais: 1,
        ativo: 'Sim',
      }),
    ]);

    await prisma.order.update({
      where: { id: deAmanha.orderId },
      data: { channel: 'ONLINE', utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'verao' },
    });
    const origem = await runReport(auth, 'origem', periodoDeHoje());
    expect(origem.rows).toEqual([
      expect.objectContaining({
        origem: 'Instagram',
        fonte: 'instagram',
        campanha: 'verao',
        vendas: 1,
        ingressos: 3,
        valor: 15000,
        participacao: 0.5,
      }),
      expect.objectContaining({ origem: 'Balcão', fonte: null, vendas: 1, ingressos: 2, valor: 9000 }),
    ]);
    expect(origem.totals).toMatchObject({ vendas: 2, valor: 24000, ticketMedio: 12000 });
  });

  it('cada perfil vê só os relatórios liberados e toda exportação fica registrada', async () => {
    const { parque, publico, auth } = await criarParqueDeVendas();
    const hoje = todayIn(FUSO);
    await abrirDia(publico.id, hoje, 30);
    const tipo = await criarTipo(publico.id, { basePriceCents: 4000 });
    await placePosOrder(auth, venda(hoje, tipo.id, 1), meta());

    const marketing = await authAs(await createUser({ parkId: parque.id, roles: ['MARKETING'] }), parque.id);
    await expectAppError(runReport(marketing.auth, 'vendas', periodoDeHoje()), 'FORBIDDEN');
    const origem = await runReport(marketing.auth, 'origem', periodoDeHoje());
    expect(origem.columns.map((coluna) => coluna.key)).not.toContain('valor');
    expect(origem.rows[0]).not.toHaveProperty('valor');
    await expectAppError(exportReport(marketing.auth, 'origem', periodoDeHoje(), 'csv', meta()), 'FORBIDDEN');

    const portaria = await authAs(await createUser({ parkId: parque.id, roles: ['GATE'] }), parque.id);
    await expectAppError(runReport(portaria.auth, 'checkins', periodoDeHoje()), 'FORBIDDEN');

    const financeiro = await authAs(await createUser({ parkId: parque.id, roles: ['FINANCE'] }), parque.id);
    const csv = await exportReport(financeiro.auth, 'vendas', periodoDeHoje(), 'csv', meta());
    expect(csv.filename).toBe(`vendas-${hoje}-a-${hoje}.csv`);
    expect(typeof csv.body).toBe('string');
    expect(csv.body).toContain('Total (R$)');
    expect(csv.body).toContain('Rita Relatório Costa');
    expect(csv.body).toContain(';40,00;');

    const planilha = await exportReport(financeiro.auth, 'faturamento', periodoDeHoje(), 'xlsx', meta());
    expect(planilha.filename).toBe(`faturamento-${hoje}-a-${hoje}.xlsx`);
    if (typeof planilha.body === 'string') throw new Error('Planilha deveria ser binária.');
    const aba = strFromU8(unzipSync(planilha.body)['xl/worksheets/sheet1.xml'] ?? new Uint8Array());
    expect(aba).toContain('Receita bruta');
    expect(aba).toContain('<v>40</v>');

    const registro = await lastAudit('reports.exported');
    expect(registro).toMatchObject({ parkId: parque.id, actorUserId: financeiro.auth.user.id });
    expect(registro?.data).toMatchObject({ report: 'faturamento', format: 'xlsx', rows: 1 });
  });
});
