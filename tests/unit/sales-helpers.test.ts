import { describe, expect, it } from 'vitest';

import { holderRequirements, priceRuleInputSchema, ticketTypeInputSchema } from '@/lib/catalog';
import { couponInputSchema, describeCouponDiscount, formatPercentBps } from '@/lib/coupon-schemas';
import { formatChange, formatPoints, plural } from '@/lib/format';
import { checkoutInputSchema, effectiveOrderStatus, formatOrderCode, normalizeOrderCode } from '@/lib/orders';
import { describeWeekdays, formatDateLong, formatMonthYear, formatShortDate } from '@/lib/weekdays';
import { centsToCsv, toCsv } from '@/server/csv';
import { pageParam, parseCustomerFilters, parseOrderFilters } from '@/server/filters';

/** Espaço comum no lugar do inseparável, para comparar textos com valor em reais. */
const espacos = (texto: string) => texto.replace(/\s/g, ' ');

describe('código do pedido', () => {
  it('formata com seis dígitos e aceita o que a pessoa digita', () => {
    expect(formatOrderCode('CP', 2026, 128)).toBe('CP-2026-000128');
    expect(formatOrderCode('CP', 2026, 1_234_567)).toBe('CP-2026-1234567');
    expect(normalizeOrderCode(' cp-2026-000128 ')).toBe('CP-2026-000128');
    expect(normalizeOrderCode('CP 2026 000128')).toBeNull();
    expect(normalizeOrderCode('2026-000128')).toBeNull();
  });

  it('pedido aguardando pagamento com prazo vencido já conta como expirado', () => {
    const agora = new Date('2026-09-13T15:00:00Z');
    expect(
      effectiveOrderStatus({ status: 'PENDING_PAYMENT', expiresAt: new Date('2026-09-13T14:59:59Z') }, agora),
    ).toBe('EXPIRED');
    expect(
      effectiveOrderStatus({ status: 'PENDING_PAYMENT', expiresAt: new Date('2026-09-13T15:10:00Z') }, agora),
    ).toBe('PENDING_PAYMENT');
    expect(
      effectiveOrderStatus({ status: 'CONFIRMED', expiresAt: new Date('2026-09-13T14:00:00Z') }, agora),
    ).toBe('CONFIRMED');
  });
});

describe('textos de cupom', () => {
  it('percentual em pontos-base', () => {
    expect(formatPercentBps(1000)).toBe('10%');
    expect(formatPercentBps(1050)).toBe('10,5%');
    expect(formatPercentBps(1025)).toBe('10,25%');
    expect(formatPercentBps(5)).toBe('0,05%');
  });

  it('resumo do desconto', () => {
    expect(
      espacos(
        describeCouponDiscount({
          discountType: 'PERCENT',
          percentBps: 1000,
          amountCents: null,
          maxDiscountCents: 5000,
        }),
      ),
    ).toBe('10% de desconto (até R$ 50,00)');
    expect(
      espacos(
        describeCouponDiscount({
          discountType: 'FIXED',
          percentBps: null,
          amountCents: 2000,
          maxDiscountCents: null,
        }),
      ),
    ).toBe('R$ 20,00 de desconto');
  });
});

describe('datas por extenso', () => {
  it('dias da semana resumidos', () => {
    expect(describeWeekdays([1, 2, 3, 4, 5])).toBe('Seg a Sex');
    expect(describeWeekdays([0, 6])).toBe('Dom e Sáb');
    expect(describeWeekdays([1, 3, 5])).toBe('Seg, Qua e Sex');
    expect(describeWeekdays([2])).toBe('Ter');
    expect(describeWeekdays([])).toBe('Todos os dias');
    expect(describeWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
  });

  it('data longa, mês e data curta', () => {
    expect(formatDateLong('2026-10-12')).toBe('segunda-feira, 12 de outubro de 2026');
    expect(formatMonthYear('2026-09')).toBe('setembro de 2026');
    expect(formatShortDate('2026-09-07')).toBe('07/09');
  });
});

describe('números dos indicadores', () => {
  it('variação e pontos percentuais', () => {
    expect(formatChange(0.125)).toBe('+12,5%');
    expect(formatChange(-0.03)).toBe('-3%');
    expect(formatChange(0)).toBe('0%');
    expect(formatPoints(0.032)).toBe('+3,2 p.p.');
    expect(formatPoints(-0.1)).toBe('-10 p.p.');
  });

  it('plural com milhar', () => {
    expect(plural(1, 'ingresso', 'ingressos')).toBe('1 ingresso');
    expect(plural(1500, 'ingresso', 'ingressos')).toBe('1.500 ingressos');
  });
});

describe('planilha CSV', () => {
  it('separa por ponto e vírgula, escapa aspas e neutraliza fórmulas', () => {
    const csv = toCsv(
      ['Nome', 'Observação'],
      [
        ['=HYPERLINK("x")', 'a;b'],
        [null, true],
        [-5, 'diz "oi"'],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      ['Nome;Observação', `"'=HYPERLINK(""x"")";"a;b"`, ';Sim', '-5;"diz ""oi"""', ''].join('\r\n'),
    );
  });

  it('centavos no formato do Excel em português', () => {
    expect(centsToCsv(125050)).toBe('1250,50');
    expect(centsToCsv(7)).toBe('0,07');
    expect(centsToCsv(-5)).toBe('-0,05');
  });
});

describe('filtros das listas', () => {
  it('ignora valor inválido e limita a página', () => {
    const filtros = parseOrderFilters({
      q: '  CP-2026-000010 ',
      situacao: 'INVENTADA',
      canal: 'POS',
      visitaDe: '2026-02-30',
      compraAte: '2026-09-13',
      pagina: '99999',
    });
    expect(filtros).toMatchObject({
      q: 'CP-2026-000010',
      status: undefined,
      channel: 'POS',
      visitFrom: undefined,
    });
    expect(filtros.createdTo).toBe('2026-09-13');
    expect(filtros.page).toBe(10_000);
    expect(pageParam('abc')).toBe(1);
    expect(pageParam(['3', '4'])).toBe(3);
  });

  it('clientes: ordem conhecida e filtro de comunicações', () => {
    expect(parseCustomerFilters({ ordem: 'gasto', comunicacoes: 'sim' })).toMatchObject({
      sort: 'gasto',
      marketing: true,
    });
    expect(parseCustomerFilters({ ordem: 'qualquer' }).sort).toBeUndefined();
  });
});

describe('esquemas dos formulários', () => {
  const tipoBase = {
    name: 'Meia-entrada',
    description: null,
    category: 'HALF',
    basePriceCents: 3500,
    minAge: null,
    maxAge: null,
    holderData: 'NAME',
    requiresDocument: false,
    documentHint: null,
    occupiesCapacity: true,
    peoplePerTicket: 1,
    dailyQuota: null,
    minPerOrder: null,
    maxPerOrder: null,
    maxPerCustomerPerDay: null,
    channels: ['ONLINE', 'ONLINE', 'POS'],
    availableFrom: null,
    availableUntil: null,
    rulesText: null,
    isActive: true,
  } as const;

  it('dados pedidos de cada visitante', () => {
    expect(holderRequirements('NAME_CPF_BIRTHDATE')).toEqual({ name: true, cpf: true, birthDate: true });
    expect(holderRequirements('NONE')).toEqual({ name: false, cpf: false, birthDate: false });
  });

  it('tipo de ingresso: documento, idade e canais sem repetição', () => {
    const valido = ticketTypeInputSchema.parse(tipoBase);
    expect(valido.channels).toEqual(['ONLINE', 'POS']);

    const semDocumento = ticketTypeInputSchema.safeParse({ ...tipoBase, requiresDocument: true });
    expect(semDocumento.success).toBe(false);
    expect(semDocumento.error?.issues[0]?.path).toEqual(['documentHint']);

    const idades = ticketTypeInputSchema.safeParse({ ...tipoBase, minAge: 12, maxAge: 3 });
    expect(idades.error?.issues[0]?.path).toEqual(['maxAge']);
  });

  it('regra de preço: preço riscado precisa ser maior', () => {
    const resultado = priceRuleInputSchema.safeParse({
      name: 'Promoção',
      priceCents: 6000,
      compareAtCents: 6000,
      dayKinds: [],
      visitFrom: null,
      visitUntil: null,
      saleFrom: null,
      saleUntil: null,
      lotQuantity: null,
      priority: 0,
      isActive: true,
    });
    expect(resultado.error?.issues[0]?.path).toEqual(['compareAtCents']);
  });

  it('cupom: código em maiúsculas, percentual obrigatório e limite por CPF', () => {
    const base = {
      code: 'verao10',
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
      weekdays: [5, 6, 6],
      maxUses: null,
      maxUsesPerCustomer: null,
      firstPurchaseOnly: false,
      channels: ['ONLINE'],
      ticketTypeIds: [],
      isActive: true,
    } as const;
    const valido = couponInputSchema.parse(base);
    expect(valido.code).toBe('VERAO10');
    expect(valido.weekdays).toEqual([5, 6]);
    expect(couponInputSchema.safeParse({ ...base, percentBps: null }).error?.issues[0]?.path).toEqual([
      'percentBps',
    ]);
    expect(
      couponInputSchema.safeParse({ ...base, maxUses: 5, maxUsesPerCustomer: 10 }).error?.issues[0]?.path,
    ).toEqual(['maxUsesPerCustomer']);
  });

  it('compra: termos obrigatórios e CPF válido do comprador', () => {
    const resultado = checkoutInputSchema.safeParse({
      buyer: {
        name: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '(73) 99999-8888',
        cpf: '111.111.111-11',
      },
      holders: [],
      couponCode: '',
      marketingOptIn: false,
      acceptTerms: false,
      idempotencyKey: '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
    });
    expect(resultado.success).toBe(false);
    const caminhos = resultado.error?.issues.map((issue) => issue.path.join('.'));
    expect(caminhos).toContain('buyer.cpf');
    expect(caminhos).toContain('acceptTerms');
  });
});
