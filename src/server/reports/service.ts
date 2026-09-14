import 'server-only';

import {
  addDays,
  dateOnlyToDb,
  dbToDateOnly,
  formatDateBR,
  formatDateTimeBR,
  isDateOnly,
  todayIn,
  zonedTimeToInstant,
  type DateOnly,
} from '@/lib/dates';
import { formatPhoneBR } from '@/lib/documents';
import { formatNumber, formatPercent, plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import {
  ORDER_CHANNEL_LABELS,
  PAYMENT_GROUP_LABELS,
  PAYMENT_METHOD_LABELS,
  paymentGroupOf,
  SALE_STATUS_LABELS,
  saleStatusOf,
  TICKET_STATUS_LABELS,
  type OrderChannelKey,
  type PaymentStatusKey,
} from '@/lib/orders';
import { hostOf, ORIGIN_LABELS, originOf } from '@/lib/origins';
import type { ParsedPeriod } from '@/lib/periods';
import {
  canSeeReport,
  REPORTS,
  type ReportColumn,
  type ReportColumnType,
  type ReportKey,
  type ReportRow,
  type ReportValue,
} from '@/lib/reports';
import { CHECKIN_METHOD_LABELS, CHECKIN_REASON_LABELS, effectiveTicketStatus } from '@/lib/tickets';

import { recordAudit } from '../audit';
import { can, requirePermission, type AuthContext } from '../auth/context';
import { getCalendarRange } from '../calendar/service';
import { centsToCsv, toCsv } from '../csv';
import { prisma, type DbClient } from '../db';
import { env } from '../env';
import { Errors } from '../errors';
import { financeByDay, financeByMethod } from '../finance/service';
import { rawNumber } from '../raw';
import type { RequestMeta } from '../request';
import { buildXlsx, type XlsxCell, type XlsxColumnType } from '../xlsx';

/**
 * Relatórios do painel. Cada relatório devolve colunas tipadas, linhas e
 * totais; a mesma estrutura alimenta a prévia na tela e as planilhas CSV e Excel.
 */

export const REPORT_PREVIEW_ROWS = 200;
const LIMITE_DE_LINHAS = 50_000;

export interface ReportResult {
  key: ReportKey;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportRow | null;
  /** Havia mais linhas do que o limite: use um período menor. */
  truncated: boolean;
}

interface Contexto {
  auth: AuthContext;
  db: DbClient;
  parkId: string;
  fuso: string;
  periodo: ParsedPeriod;
  inicio: Date;
  fim: Date;
  hoje: DateOnly;
}

type Montagem = Omit<ReportResult, 'key'>;

const PAGAMENTO_EFETIVADO: readonly PaymentStatusKey[] = [
  'APPROVED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'CHARGEBACK',
];

function limitar<T>(itens: T[]): { itens: T[]; truncated: boolean } {
  return itens.length > LIMITE_DE_LINHAS
    ? { itens: itens.slice(0, LIMITE_DE_LINHAS), truncated: true }
    : { itens, truncated: false };
}

function somar<T>(itens: readonly T[], valor: (item: T) => number): number {
  return itens.reduce((total, item) => total + valor(item), 0);
}

function fracao(parte: number, todo: number): number | null {
  return todo > 0 ? parte / todo : null;
}

/** Valores em dinheiro de faturamento por origem: só para quem vê o financeiro. */
function verValores(auth: AuthContext): boolean {
  return can(auth, 'finance.view') || can(auth, 'dashboard.financial');
}

function origemDoPedido(
  pedido: { channel: OrderChannelKey; utmSource: string | null; referrer: string | null },
  dominio: string | null,
): string {
  if (pedido.channel === 'POS') return 'Balcão';
  if (pedido.channel !== 'ONLINE') return ORDER_CHANNEL_LABELS[pedido.channel];
  return ORIGIN_LABELS[
    originOf({ utmSource: pedido.utmSource, referrerHost: hostOf(pedido.referrer), ownHost: dominio })
  ];
}

// ─── Vendas ─────────────────────────────────────────────────────────────────

async function relatorioDeVendas({ db, parkId, inicio, fim }: Contexto): Promise<Montagem> {
  const agora = new Date();
  const dominio = hostOf(env().APP_URL);
  const pedidos = await db.order.findMany({
    where: { parkId, createdAt: { gte: inicio, lt: fim } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: LIMITE_DE_LINHAS + 1,
    select: {
      code: true,
      createdAt: true,
      visitDate: true,
      status: true,
      financialStatus: true,
      expiresAt: true,
      channel: true,
      buyerName: true,
      buyerCpfMasked: true,
      buyerPhone: true,
      buyerEmail: true,
      subtotalCents: true,
      discountCents: true,
      totalCents: true,
      utmSource: true,
      utmCampaign: true,
      referrer: true,
      coupon: { select: { code: true } },
      payments: { select: { method: true, status: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      _count: { select: { tickets: true } },
    },
  });
  const { itens, truncated } = limitar(pedidos);
  const pagos = itens.filter((pedido) => saleStatusOf(pedido, agora) === 'PAID');

  return {
    columns: [
      { key: 'pedido', label: 'Pedido', type: 'text' },
      { key: 'compra', label: 'Compra', type: 'datetime' },
      { key: 'visita', label: 'Visita', type: 'date' },
      { key: 'situacao', label: 'Situação', type: 'text' },
      { key: 'canal', label: 'Canal', type: 'text' },
      { key: 'pagamento', label: 'Forma de pagamento', type: 'text' },
      { key: 'cliente', label: 'Cliente', type: 'text' },
      { key: 'cpf', label: 'CPF', type: 'text' },
      { key: 'celular', label: 'Celular', type: 'text' },
      { key: 'email', label: 'E-mail', type: 'text' },
      { key: 'ingressos', label: 'Ingressos', type: 'integer' },
      { key: 'subtotal', label: 'Subtotal', type: 'money' },
      { key: 'desconto', label: 'Desconto', type: 'money' },
      { key: 'total', label: 'Total', type: 'money' },
      { key: 'cupom', label: 'Cupom', type: 'text' },
      { key: 'origem', label: 'Origem', type: 'text' },
      { key: 'campanha', label: 'Campanha', type: 'text' },
    ],
    rows: itens.map((pedido) => {
      const pagamento =
        pedido.payments.find((item) => PAGAMENTO_EFETIVADO.includes(item.status)) ?? pedido.payments[0];
      return {
        pedido: pedido.code,
        compra: pedido.createdAt,
        visita: dbToDateOnly(pedido.visitDate),
        situacao: SALE_STATUS_LABELS[saleStatusOf(pedido, agora)],
        canal: ORDER_CHANNEL_LABELS[pedido.channel],
        pagamento: pagamento ? PAYMENT_METHOD_LABELS[pagamento.method] : null,
        cliente: pedido.buyerName,
        cpf: pedido.buyerCpfMasked,
        celular: pedido.buyerPhone ? formatPhoneBR(pedido.buyerPhone) : null,
        email: pedido.buyerEmail,
        ingressos: pedido._count.tickets,
        subtotal: pedido.subtotalCents,
        desconto: pedido.discountCents,
        total: pedido.totalCents,
        cupom: pedido.coupon?.code ?? null,
        origem: origemDoPedido(pedido, dominio),
        campanha: pedido.utmCampaign,
      };
    }),
    totals: {
      pedido: plural(pagos.length, 'venda paga', 'vendas pagas'),
      ingressos: somar(pagos, (pedido) => pedido._count.tickets),
      subtotal: somar(pagos, (pedido) => pedido.subtotalCents),
      desconto: somar(pagos, (pedido) => pedido.discountCents),
      total: somar(pagos, (pedido) => pedido.totalCents),
    },
    truncated,
  };
}

// ─── Faturamento e formas de pagamento ──────────────────────────────────────

async function relatorioDeFaturamento({ db, parkId, fuso, periodo }: Contexto): Promise<Montagem> {
  const dias = await financeByDay(db, parkId, fuso, periodo.range);
  return {
    columns: [
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'vendas', label: 'Vendas pagas', type: 'integer' },
      { key: 'bruto', label: 'Receita bruta', type: 'money' },
      { key: 'reembolsos', label: 'Reembolsos', type: 'money' },
      { key: 'taxas', label: 'Taxas', type: 'money' },
      { key: 'liquido', label: 'Receita líquida', type: 'money' },
      { key: 'descontos', label: 'Descontos concedidos', type: 'money' },
    ],
    rows: dias.map((dia) => ({
      data: dia.date,
      vendas: dia.paidOrders,
      bruto: dia.grossCents,
      reembolsos: dia.refundsCents,
      taxas: dia.feesCents,
      liquido: dia.netCents,
      descontos: dia.discountsCents,
    })),
    totals: {
      data: 'Total',
      vendas: somar(dias, (dia) => dia.paidOrders),
      bruto: somar(dias, (dia) => dia.grossCents),
      reembolsos: somar(dias, (dia) => dia.refundsCents),
      taxas: somar(dias, (dia) => dia.feesCents),
      liquido: somar(dias, (dia) => dia.netCents),
      descontos: somar(dias, (dia) => dia.discountsCents),
    },
    truncated: false,
  };
}

async function relatorioDePagamentos({ db, parkId, inicio, fim }: Contexto): Promise<Montagem> {
  const linhas = await financeByMethod(db, parkId, inicio, fim);
  const bruto = somar(linhas, (linha) => linha.grossCents);
  return {
    columns: [
      { key: 'forma', label: 'Forma de pagamento', type: 'text' },
      { key: 'grupo', label: 'Grupo', type: 'text' },
      { key: 'pagamentos', label: 'Pagamentos', type: 'integer' },
      { key: 'bruto', label: 'Bruto', type: 'money' },
      { key: 'reembolsos', label: 'Reembolsos', type: 'money' },
      { key: 'taxas', label: 'Taxas', type: 'money' },
      { key: 'liquido', label: 'Líquido', type: 'money' },
      { key: 'participacao', label: 'Participação no bruto', type: 'percent' },
    ],
    rows: linhas.map((linha) => ({
      forma: PAYMENT_METHOD_LABELS[linha.method],
      grupo: PAYMENT_GROUP_LABELS[paymentGroupOf(linha.method)],
      pagamentos: linha.payments,
      bruto: linha.grossCents,
      reembolsos: linha.refundsCents,
      taxas: linha.feesCents,
      liquido: linha.netCents,
      participacao: fracao(linha.grossCents, bruto),
    })),
    totals: {
      forma: 'Total',
      pagamentos: somar(linhas, (linha) => linha.payments),
      bruto,
      reembolsos: somar(linhas, (linha) => linha.refundsCents),
      taxas: somar(linhas, (linha) => linha.feesCents),
      liquido: somar(linhas, (linha) => linha.netCents),
      participacao: bruto > 0 ? 1 : null,
    },
    truncated: false,
  };
}

// ─── Ingressos, visitantes e check-ins ──────────────────────────────────────

async function relatorioDeIngressos({ db, parkId, periodo, hoje }: Contexto): Promise<Montagem> {
  const ingressos = await db.ticket.findMany({
    where: {
      parkId,
      visitDate: { gte: dateOnlyToDb(periodo.range.from), lte: dateOnlyToDb(periodo.range.to) },
    },
    orderBy: [{ visitDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    take: LIMITE_DE_LINHAS + 1,
    select: {
      code: true,
      visitDate: true,
      status: true,
      holderName: true,
      holderCpfMasked: true,
      isCourtesy: true,
      priceCents: true,
      checkedInAt: true,
      ticketType: { select: { name: true } },
      order: { select: { code: true, buyerName: true, channel: true } },
    },
  });
  const { itens, truncated } = limitar(ingressos);
  const validos = itens.filter(
    (ingresso) => ingresso.status === 'ACTIVE' || ingresso.status === 'CHECKED_IN',
  );

  return {
    columns: [
      { key: 'codigo', label: 'Código', type: 'text' },
      { key: 'visita', label: 'Visita', type: 'date' },
      { key: 'tipo', label: 'Tipo', type: 'text' },
      { key: 'visitante', label: 'Visitante', type: 'text' },
      { key: 'cpf', label: 'CPF do visitante', type: 'text' },
      { key: 'pedido', label: 'Pedido', type: 'text' },
      { key: 'comprador', label: 'Comprador', type: 'text' },
      { key: 'canal', label: 'Canal', type: 'text' },
      { key: 'situacao', label: 'Situação', type: 'text' },
      { key: 'valor', label: 'Valor', type: 'money' },
      { key: 'cortesia', label: 'Cortesia', type: 'text' },
      { key: 'entrada', label: 'Entrada', type: 'datetime' },
    ],
    rows: itens.map((ingresso) => {
      const visita = dbToDateOnly(ingresso.visitDate);
      return {
        codigo: ingresso.code,
        visita,
        tipo: ingresso.ticketType.name,
        visitante: ingresso.holderName,
        cpf: ingresso.holderCpfMasked,
        pedido: ingresso.order.code,
        comprador: ingresso.order.buyerName,
        canal: ORDER_CHANNEL_LABELS[ingresso.order.channel],
        situacao:
          TICKET_STATUS_LABELS[effectiveTicketStatus({ status: ingresso.status, visitDate: visita }, hoje)],
        valor: ingresso.priceCents,
        cortesia: ingresso.isCourtesy ? 'Sim' : null,
        entrada: ingresso.checkedInAt,
      };
    }),
    totals: {
      codigo: plural(validos.length, 'ingresso válido', 'ingressos válidos'),
      valor: somar(validos, (ingresso) => ingresso.priceCents),
    },
    truncated,
  };
}

async function relatorioDeVisitantes({ db, parkId, periodo, hoje }: Contexto): Promise<Montagem> {
  const { from, to } = periodo.range;
  const [dias, contagens] = await Promise.all([
    getCalendarRange(parkId, from, to, db),
    db.$queryRaw<{ dia: string; esperados: number; entradas: number }[]>`
      SELECT to_char(visit_date, 'YYYY-MM-DD') AS dia,
        COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'CHECKED_IN'))::int AS esperados,
        COUNT(*) FILTER (WHERE status = 'CHECKED_IN')::int AS entradas
      FROM tickets
      WHERE park_id = ${parkId}::uuid AND visit_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1`,
  ]);
  const porDia = new Map(contagens.map((linha) => [linha.dia, linha]));
  const linhas = dias.flatMap((dia) => {
    const esperados = porDia.get(dia.date)?.esperados ?? 0;
    const entradas = porDia.get(dia.date)?.entradas ?? 0;
    if (dia.status !== 'OPEN' && esperados === 0) return [];
    return [
      {
        dia,
        esperados,
        entradas,
        capacidade: dia.status === 'OPEN' ? dia.capacity : null,
        comecou: dia.date <= hoje,
        encerrado: dia.date < hoje,
      },
    ];
  });
  const abertos = linhas.filter((linha) => linha.capacidade !== null);
  const comecados = linhas.filter((linha) => linha.comecou);
  const encerrados = linhas.filter((linha) => linha.encerrado);
  const capacidadeTotal = somar(abertos, (linha) => linha.capacidade ?? 0);

  return {
    columns: [
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'funcionamento', label: 'Funcionamento', type: 'text' },
      { key: 'capacidade', label: 'Capacidade', type: 'integer' },
      { key: 'vendidos', label: 'Vendidos', type: 'integer' },
      { key: 'disponiveis', label: 'Disponíveis', type: 'integer' },
      { key: 'ocupacao', label: 'Ocupação', type: 'percent' },
      { key: 'esperados', label: 'Visitantes esperados', type: 'integer' },
      { key: 'entradas', label: 'Entradas', type: 'integer' },
      { key: 'comparecimento', label: 'Comparecimento', type: 'percent' },
      { key: 'noShow', label: 'Não vieram', type: 'integer' },
    ],
    rows: linhas.map(({ dia, esperados, entradas, capacidade, comecou, encerrado }) => ({
      data: dia.date,
      funcionamento:
        dia.status === 'OPEN' ? 'Aberto' : dia.status === 'CLOSED' ? 'Fechado' : 'Sem configuração',
      capacidade,
      vendidos: dia.sold,
      disponiveis: dia.available,
      ocupacao: capacidade ? dia.sold / capacidade : null,
      esperados,
      entradas,
      comparecimento: comecou && esperados > 0 ? entradas / esperados : null,
      noShow: encerrado ? Math.max(0, esperados - entradas) : null,
    })),
    totals: {
      data: 'Total',
      capacidade: capacidadeTotal,
      vendidos: somar(linhas, (linha) => linha.dia.sold),
      disponiveis: somar(abertos, (linha) => linha.dia.available ?? 0),
      ocupacao: fracao(
        somar(abertos, (linha) => linha.dia.sold),
        capacidadeTotal,
      ),
      esperados: somar(linhas, (linha) => linha.esperados),
      entradas: somar(linhas, (linha) => linha.entradas),
      comparecimento: fracao(
        somar(comecados, (linha) => linha.entradas),
        somar(comecados, (linha) => linha.esperados),
      ),
      noShow: somar(encerrados, (linha) => Math.max(0, linha.esperados - linha.entradas)),
    },
    truncated: false,
  };
}

async function relatorioDeCheckins({ db, parkId, inicio, fim }: Contexto): Promise<Montagem> {
  const tentativas = await db.checkinAttempt.findMany({
    where: { parkId, createdAt: { gte: inicio, lt: fim } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: LIMITE_DE_LINHAS + 1,
    select: {
      createdAt: true,
      result: true,
      reason: true,
      method: true,
      codeTried: true,
      device: true,
      ticket: {
        select: {
          code: true,
          holderName: true,
          visitDate: true,
          ticketType: { select: { name: true } },
          order: { select: { code: true, buyerName: true } },
        },
      },
    },
  });
  const { itens, truncated } = limitar(tentativas);
  const liberadas = itens.filter((tentativa) => tentativa.result === 'ALLOWED').length;

  return {
    columns: [
      { key: 'horario', label: 'Horário', type: 'datetime' },
      { key: 'resultado', label: 'Resultado', type: 'text' },
      { key: 'motivo', label: 'Motivo', type: 'text' },
      { key: 'leitura', label: 'Leitura', type: 'text' },
      { key: 'ingresso', label: 'Ingresso', type: 'text' },
      { key: 'visitante', label: 'Visitante', type: 'text' },
      { key: 'tipo', label: 'Tipo', type: 'text' },
      { key: 'visita', label: 'Data do ingresso', type: 'date' },
      { key: 'pedido', label: 'Pedido', type: 'text' },
      { key: 'aparelho', label: 'Aparelho', type: 'text' },
    ],
    rows: itens.map((tentativa) => ({
      horario: tentativa.createdAt,
      resultado: tentativa.result === 'ALLOWED' ? 'Entrada liberada' : 'Entrada negada',
      motivo: tentativa.reason ? CHECKIN_REASON_LABELS[tentativa.reason] : null,
      leitura: CHECKIN_METHOD_LABELS[tentativa.method],
      ingresso: tentativa.ticket?.code ?? tentativa.codeTried,
      visitante: tentativa.ticket ? (tentativa.ticket.holderName ?? tentativa.ticket.order.buyerName) : null,
      tipo: tentativa.ticket?.ticketType.name ?? null,
      visita: tentativa.ticket ? dbToDateOnly(tentativa.ticket.visitDate) : null,
      pedido: tentativa.ticket?.order.code ?? null,
      aparelho: tentativa.device,
    })),
    totals: {
      horario: plural(liberadas, 'liberada', 'liberadas'),
      resultado: plural(itens.length - liberadas, 'negada', 'negadas'),
    },
    truncated,
  };
}

// ─── Clientes, cupons e origem ──────────────────────────────────────────────

async function relatorioDeClientes({ db, parkId, inicio, fim }: Contexto): Promise<Montagem> {
  const clientes = await db.$queryRaw<
    {
      name: string;
      cpf_masked: string | null;
      phone: string | null;
      email: string | null;
      marketing_opt_in: boolean;
      compras: number;
      gasto: bigint | number;
      ingressos: number;
      primeira_compra: Date;
      visitas: number;
      gasto_total: bigint | number;
    }[]
  >`
    WITH pedidos AS (
      SELECT id, customer_id, total_cents
      FROM orders
      WHERE park_id = ${parkId}::uuid AND status = 'CONFIRMED' AND channel <> 'COURTESY'
        AND customer_id IS NOT NULL AND confirmed_at >= ${inicio} AND confirmed_at < ${fim}
    ),
    resumo AS (
      SELECT customer_id, COUNT(*)::int AS compras, SUM(total_cents)::bigint AS gasto
      FROM pedidos
      GROUP BY customer_id
    )
    SELECT c.name, c.cpf_masked, c.phone, c.email, c.marketing_opt_in, r.compras, r.gasto,
      (SELECT COUNT(*)::int FROM tickets t JOIN pedidos p ON p.id = t.order_id
        WHERE p.customer_id = c.id AND t.status IN ('ACTIVE', 'CHECKED_IN')) AS ingressos,
      (SELECT MIN(o.confirmed_at) FROM orders o
        WHERE o.customer_id = c.id AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY') AS primeira_compra,
      (SELECT COUNT(DISTINCT t.visit_date)::int FROM tickets t JOIN orders o ON o.id = t.order_id
        WHERE o.customer_id = c.id AND t.status = 'CHECKED_IN') AS visitas,
      (SELECT COALESCE(SUM(o.total_cents), 0)::bigint FROM orders o
        WHERE o.customer_id = c.id AND o.status = 'CONFIRMED' AND o.channel <> 'COURTESY') AS gasto_total
    FROM resumo r
    JOIN customers c ON c.id = r.customer_id
    ORDER BY r.gasto DESC, c.name ASC
    LIMIT ${LIMITE_DE_LINHAS + 1}`;
  const { itens, truncated } = limitar(clientes);
  const novos = itens.filter((cliente) => cliente.primeira_compra >= inicio).length;

  return {
    columns: [
      { key: 'cliente', label: 'Cliente', type: 'text' },
      { key: 'cpf', label: 'CPF', type: 'text' },
      { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
      { key: 'email', label: 'E-mail', type: 'text' },
      { key: 'perfil', label: 'Novo ou recorrente', type: 'text' },
      { key: 'compras', label: 'Compras no período', type: 'integer' },
      { key: 'gasto', label: 'Gasto no período', type: 'money' },
      { key: 'ingressos', label: 'Ingressos no período', type: 'integer' },
      { key: 'primeiraCompra', label: 'Primeira compra', type: 'datetime' },
      { key: 'visitas', label: 'Visitas', type: 'integer' },
      { key: 'gastoTotal', label: 'Total gasto', type: 'money' },
      { key: 'marketing', label: 'Aceita novidades', type: 'text' },
    ],
    rows: itens.map((cliente) => ({
      cliente: cliente.name,
      cpf: cliente.cpf_masked,
      whatsapp: cliente.phone ? formatPhoneBR(cliente.phone) : null,
      email: cliente.email,
      perfil: cliente.primeira_compra >= inicio ? 'Novo' : 'Recorrente',
      compras: cliente.compras,
      gasto: rawNumber(cliente.gasto),
      ingressos: cliente.ingressos,
      primeiraCompra: cliente.primeira_compra,
      visitas: cliente.visitas,
      gastoTotal: rawNumber(cliente.gasto_total),
      marketing: cliente.marketing_opt_in ? 'Sim' : 'Não',
    })),
    totals: {
      cliente: plural(itens.length, 'cliente', 'clientes'),
      perfil: `${plural(novos, 'novo', 'novos')}, ${formatNumber(itens.length - novos)} recorrentes`,
      compras: somar(itens, (cliente) => cliente.compras),
      gasto: somar(itens, (cliente) => rawNumber(cliente.gasto)),
      ingressos: somar(itens, (cliente) => cliente.ingressos),
    },
    truncated,
  };
}

async function relatorioDeCupons({ db, parkId, inicio, fim }: Contexto): Promise<Montagem> {
  const cupons = await db.$queryRaw<
    {
      code: string;
      description: string | null;
      discount_type: 'PERCENT' | 'FIXED';
      percent_bps: number | null;
      amount_cents: number | null;
      max_uses: number | null;
      is_active: boolean;
      usos: number;
      desconto: bigint | number;
      vendas: bigint | number;
      ingressos: number;
      usos_totais: number;
    }[]
  >`
    WITH usos AS (
      SELECT u.coupon_id, COUNT(*)::int AS usos,
        SUM(u.discount_cents)::bigint AS desconto,
        SUM(o.total_cents)::bigint AS vendas,
        SUM(t.quantidade)::int AS ingressos
      FROM coupon_usages u
      JOIN orders o ON o.id = u.order_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS quantidade FROM tickets
        WHERE order_id = o.id AND status IN ('ACTIVE', 'CHECKED_IN')
      ) t ON true
      WHERE o.park_id = ${parkId}::uuid AND u.status = 'CONFIRMED'
        AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
      GROUP BY u.coupon_id
    )
    SELECT c.code, c.description, c.discount_type::text AS discount_type, c.percent_bps, c.amount_cents,
      c.max_uses, c.is_active,
      COALESCE(u.usos, 0)::int AS usos,
      COALESCE(u.desconto, 0)::bigint AS desconto,
      COALESCE(u.vendas, 0)::bigint AS vendas,
      COALESCE(u.ingressos, 0)::int AS ingressos,
      (SELECT COUNT(*)::int FROM coupon_usages x WHERE x.coupon_id = c.id AND x.status = 'CONFIRMED') AS usos_totais
    FROM coupons c
    LEFT JOIN usos u ON u.coupon_id = c.id
    WHERE c.park_id = ${parkId}::uuid AND (u.coupon_id IS NOT NULL OR c.is_active)
    ORDER BY COALESCE(u.usos, 0) DESC, c.code ASC`;

  return {
    columns: [
      { key: 'cupom', label: 'Cupom', type: 'text' },
      { key: 'descricao', label: 'Descrição', type: 'text' },
      { key: 'regra', label: 'Desconto', type: 'text' },
      { key: 'usos', label: 'Usos no período', type: 'integer' },
      { key: 'desconto', label: 'Desconto concedido', type: 'money' },
      { key: 'vendas', label: 'Vendas geradas', type: 'money' },
      { key: 'ingressos', label: 'Ingressos', type: 'integer' },
      { key: 'usosTotais', label: 'Usos desde a criação', type: 'integer' },
      { key: 'limite', label: 'Limite de usos', type: 'integer' },
      { key: 'ativo', label: 'Ativo', type: 'text' },
    ],
    rows: cupons.map((cupom) => ({
      cupom: cupom.code,
      descricao: cupom.description,
      regra:
        cupom.discount_type === 'PERCENT'
          ? formatPercent((cupom.percent_bps ?? 0) / 10_000)
          : formatBRL(cupom.amount_cents ?? 0),
      usos: cupom.usos,
      desconto: rawNumber(cupom.desconto),
      vendas: rawNumber(cupom.vendas),
      ingressos: cupom.ingressos,
      usosTotais: cupom.usos_totais,
      limite: cupom.max_uses,
      ativo: cupom.is_active ? 'Sim' : 'Não',
    })),
    totals: {
      cupom: 'Total',
      usos: somar(cupons, (cupom) => cupom.usos),
      desconto: somar(cupons, (cupom) => rawNumber(cupom.desconto)),
      vendas: somar(cupons, (cupom) => rawNumber(cupom.vendas)),
      ingressos: somar(cupons, (cupom) => cupom.ingressos),
    },
    truncated: false,
  };
}

async function relatorioDeOrigem({ auth, db, parkId, inicio, fim }: Contexto): Promise<Montagem> {
  const valores = verValores(auth);
  const dominio = hostOf(env().APP_URL);
  const grupos = await db.$queryRaw<
    {
      channel: OrderChannelKey;
      source: string | null;
      medium: string | null;
      campaign: string | null;
      content: string | null;
      referrer: string | null;
      vendas: number;
      ingressos: number;
      valor: bigint | number;
    }[]
  >`
    SELECT o.channel::text AS channel,
      lower(NULLIF(btrim(o.utm_source), '')) AS source,
      lower(NULLIF(btrim(o.utm_medium), '')) AS medium,
      NULLIF(btrim(o.utm_campaign), '') AS campaign,
      NULLIF(btrim(o.utm_content), '') AS content,
      CASE WHEN o.referrer IS NULL THEN NULL
        ELSE 'https://' || lower(substring(o.referrer from '^[a-zA-Z]+://([^/:?#]+)')) END AS referrer,
      COUNT(*)::int AS vendas,
      COALESCE(SUM(t.quantidade), 0)::int AS ingressos,
      COALESCE(SUM(o.total_cents), 0)::bigint AS valor
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS quantidade FROM tickets
      WHERE order_id = o.id AND status IN ('ACTIVE', 'CHECKED_IN')
    ) t ON true
    WHERE o.park_id = ${parkId}::uuid AND o.status = 'CONFIRMED' AND o.channel IN ('ONLINE', 'POS')
      AND o.confirmed_at >= ${inicio} AND o.confirmed_at < ${fim}
    GROUP BY 1, 2, 3, 4, 5, 6`;

  const somados = new Map<
    string,
    {
      origem: string;
      fonte: string | null;
      midia: string | null;
      campanha: string | null;
      conteudo: string | null;
      vendas: number;
      ingressos: number;
      valor: number;
    }
  >();
  for (const grupo of grupos) {
    const origem = origemDoPedido(
      { channel: grupo.channel, utmSource: grupo.source, referrer: grupo.referrer },
      dominio,
    );
    const chave = [origem, grupo.source, grupo.medium, grupo.campaign, grupo.content].join(' ');
    const atual = somados.get(chave) ?? {
      origem,
      fonte: grupo.source,
      midia: grupo.medium,
      campanha: grupo.campaign,
      conteudo: grupo.content,
      vendas: 0,
      ingressos: 0,
      valor: 0,
    };
    atual.vendas += grupo.vendas;
    atual.ingressos += grupo.ingressos;
    atual.valor += rawNumber(grupo.valor);
    somados.set(chave, atual);
  }
  const linhas = [...somados.values()].sort((a, b) => b.vendas - a.vendas || b.valor - a.valor);
  const totalDeVendas = somar(linhas, (linha) => linha.vendas);
  const totalDeValor = somar(linhas, (linha) => linha.valor);

  const colunas: ReportColumn[] = [
    { key: 'origem', label: 'Origem', type: 'text' },
    { key: 'fonte', label: 'utm_source', type: 'text' },
    { key: 'midia', label: 'utm_medium', type: 'text' },
    { key: 'campanha', label: 'utm_campaign', type: 'text' },
    { key: 'conteudo', label: 'utm_content', type: 'text' },
    { key: 'vendas', label: 'Vendas', type: 'integer' },
    { key: 'ingressos', label: 'Ingressos', type: 'integer' },
    { key: 'participacao', label: 'Participação nas vendas', type: 'percent' },
  ];
  if (valores) {
    colunas.push(
      { key: 'valor', label: 'Valor vendido', type: 'money' },
      { key: 'ticketMedio', label: 'Ticket médio', type: 'money' },
    );
  }

  return {
    columns: colunas,
    rows: linhas.map((linha) => ({
      origem: linha.origem,
      fonte: linha.fonte,
      midia: linha.midia,
      campanha: linha.campanha,
      conteudo: linha.conteudo,
      vendas: linha.vendas,
      ingressos: linha.ingressos,
      participacao: fracao(linha.vendas, totalDeVendas),
      ...(valores ? { valor: linha.valor, ticketMedio: Math.round(linha.valor / linha.vendas) } : {}),
    })),
    totals: {
      origem: 'Total',
      vendas: totalDeVendas,
      ingressos: somar(linhas, (linha) => linha.ingressos),
      participacao: totalDeVendas > 0 ? 1 : null,
      ...(valores
        ? {
            valor: totalDeValor,
            ticketMedio: totalDeVendas > 0 ? Math.round(totalDeValor / totalDeVendas) : null,
          }
        : {}),
    },
    truncated: false,
  };
}

// ─── Execução e exportação ──────────────────────────────────────────────────

const RELATORIOS: Readonly<Record<ReportKey, (ctx: Contexto) => Promise<Montagem>>> = {
  vendas: relatorioDeVendas,
  faturamento: relatorioDeFaturamento,
  pagamentos: relatorioDePagamentos,
  ingressos: relatorioDeIngressos,
  visitantes: relatorioDeVisitantes,
  checkins: relatorioDeCheckins,
  clientes: relatorioDeClientes,
  cupons: relatorioDeCupons,
  origem: relatorioDeOrigem,
};

export async function runReport(
  auth: AuthContext,
  chave: ReportKey,
  periodo: ParsedPeriod,
  db: DbClient = prisma,
): Promise<ReportResult> {
  requirePermission(auth, 'reports.view');
  if (!canSeeReport(auth.permissions, chave)) throw Errors.forbidden(REPORTS[chave].permissions[0]);
  const fuso = auth.park.timezone;
  const montagem = await RELATORIOS[chave]({
    auth,
    db,
    parkId: auth.park.id,
    fuso,
    periodo,
    inicio: zonedTimeToInstant(periodo.range.from, '00:00', fuso),
    fim: zonedTimeToInstant(addDays(periodo.range.to, 1), '00:00', fuso),
    hoje: todayIn(fuso),
  });
  return { key: chave, ...montagem };
}

const TIPO_NA_PLANILHA: Readonly<Record<ReportColumnType, XlsxColumnType>> = {
  text: 'text',
  integer: 'integer',
  money: 'money',
  percent: 'percent',
  date: 'text',
  datetime: 'text',
};

function textoDaData(valor: ReportValue, fuso: string): ReportValue {
  if (valor instanceof Date) return formatDateTimeBR(valor, fuso);
  if (typeof valor === 'string' && isDateOnly(valor)) return formatDateBR(valor);
  return valor;
}

function celulaDaPlanilha(valor: ReportValue, fuso: string): XlsxCell {
  const convertido = textoDaData(valor, fuso);
  return convertido instanceof Date ? null : convertido;
}

function celulaDoCsv(valor: ReportValue, tipo: ReportColumnType, fuso: string): string | number | null {
  const convertido = textoDaData(valor, fuso);
  if (convertido === null || convertido instanceof Date) return null;
  if (typeof convertido === 'string') return convertido;
  if (tipo === 'money') return centsToCsv(convertido);
  if (tipo === 'percent') return (convertido * 100).toFixed(1).replace('.', ',');
  return convertido;
}

export interface ReportFile {
  filename: string;
  contentType: string;
  body: string | Uint8Array;
}

export async function exportReport(
  auth: AuthContext,
  chave: ReportKey,
  periodo: ParsedPeriod,
  formato: 'csv' | 'xlsx',
  meta: RequestMeta,
  db: DbClient = prisma,
): Promise<ReportFile> {
  requirePermission(auth, 'reports.view', 'reports.export');
  const relatorio = await runReport(auth, chave, periodo, db);
  const fuso = auth.park.timezone;
  const nome = `${chave}-${periodo.range.from}-a-${periodo.range.to}`;
  const linhas = relatorio.totals ? [...relatorio.rows, relatorio.totals] : relatorio.rows;

  const arquivo: ReportFile =
    formato === 'xlsx'
      ? {
          filename: `${nome}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: buildXlsx({
            name: REPORTS[chave].title,
            columns: relatorio.columns.map((coluna) => ({
              label: coluna.label,
              type: TIPO_NA_PLANILHA[coluna.type],
            })),
            rows: relatorio.rows.map((linha) =>
              relatorio.columns.map((coluna) => celulaDaPlanilha(linha[coluna.key] ?? null, fuso)),
            ),
            totals: relatorio.totals
              ? relatorio.columns.map((coluna) =>
                  celulaDaPlanilha(relatorio.totals?.[coluna.key] ?? null, fuso),
                )
              : null,
          }),
        }
      : {
          filename: `${nome}.csv`,
          contentType: 'text/csv; charset=utf-8',
          body: toCsv(
            relatorio.columns.map((coluna) =>
              coluna.type === 'money'
                ? `${coluna.label} (R$)`
                : coluna.type === 'percent'
                  ? `${coluna.label} (%)`
                  : coluna.label,
            ),
            linhas.map((linha) =>
              relatorio.columns.map((coluna) => celulaDoCsv(linha[coluna.key] ?? null, coluna.type, fuso)),
            ),
          ),
        };

  await recordAudit(db, {
    action: 'reports.exported',
    parkId: auth.park.id,
    actorUserId: auth.user.id,
    entityType: 'report',
    data: {
      report: chave,
      format: formato,
      rows: relatorio.rows.length,
      truncated: relatorio.truncated,
      period: { key: periodo.key, from: periodo.range.from, to: periodo.range.to },
    },
    meta,
  });
  return arquivo;
}
