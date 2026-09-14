import type { PermissionKey } from './access';
import { formatDateBR, formatDateTimeBR, isDateOnly } from './dates';
import { formatNumber, formatPercent } from './format';
import { formatBRL } from './money';

/** Relatórios: catálogo, colunas e formatação para tela e planilha. */

export const REPORT_KEYS = [
  'vendas',
  'faturamento',
  'pagamentos',
  'ingressos',
  'visitantes',
  'checkins',
  'clientes',
  'cupons',
  'origem',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export function isReportKey(valor: string): valor is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(valor);
}

export type ReportColumnType = 'text' | 'integer' | 'money' | 'percent' | 'date' | 'datetime';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

/** Datas (`date`) chegam como "AAAA-MM-DD"; instantes (`datetime`), como Date; dinheiro, em centavos. */
export type ReportValue = string | number | Date | null;
export type ReportRow = Record<string, ReportValue>;

export interface ReportInfo {
  title: string;
  description: string;
  /** Qual data o período filtra. */
  basis: string;
  /** Precisa de `reports.view` e de ao menos uma destas. */
  permissions: readonly PermissionKey[];
}

export const REPORTS: Readonly<Record<ReportKey, ReportInfo>> = {
  vendas: {
    title: 'Vendas',
    description:
      'Cada venda com cliente, data da visita, forma de pagamento, situação, valores, cupom e origem.',
    basis: 'Data da compra',
    permissions: ['orders.view'],
  },
  faturamento: {
    title: 'Faturamento',
    description: 'Receita bruta, reembolsos, taxas e receita líquida, dia a dia.',
    basis: 'Data do pagamento',
    permissions: ['finance.view'],
  },
  pagamentos: {
    title: 'Formas de pagamento',
    description: 'PIX, cartão, dinheiro e outros: quantidade, valores e participação no total.',
    basis: 'Data do pagamento',
    permissions: ['finance.view'],
  },
  ingressos: {
    title: 'Ingressos',
    description: 'Cada ingresso com tipo, visitante, situação, valor e horário de entrada.',
    basis: 'Data da visita',
    permissions: ['tickets.view'],
  },
  visitantes: {
    title: 'Visitantes',
    description: 'Por dia de visita: capacidade, esperados, entradas, comparecimento, no-show e ocupação.',
    basis: 'Data da visita',
    permissions: ['reports.view'],
  },
  checkins: {
    title: 'Check-ins',
    description: 'Todas as leituras da portaria, liberadas e negadas, com motivo, operador e aparelho.',
    basis: 'Data da leitura',
    permissions: ['checkin.monitor', 'tickets.view'],
  },
  clientes: {
    title: 'Clientes',
    description: 'Clientes que compraram no período: compras, total gasto, visitas, novos e recorrentes.',
    basis: 'Data da compra paga',
    permissions: ['customers.view'],
  },
  cupons: {
    title: 'Cupons',
    description: 'Usos, desconto concedido e vendas geradas por cupom.',
    basis: 'Data da compra paga',
    permissions: ['coupons.view'],
  },
  origem: {
    title: 'Origem das vendas',
    description:
      'Vendas e faturamento por origem e campanha: Instagram, Facebook, TikTok, Google, WhatsApp, direto e balcão.',
    basis: 'Data da compra paga',
    permissions: ['marketing.view', 'finance.view'],
  },
};

export function canSeeReport(permissoes: ReadonlySet<PermissionKey>, chave: ReportKey): boolean {
  return (
    permissoes.has('reports.view') &&
    REPORTS[chave].permissions.some((permissao) => permissoes.has(permissao))
  );
}

export function formatReportValue(valor: ReportValue, tipo: ReportColumnType, fuso: string): string {
  if (valor === null || valor === '') return '';
  if (typeof valor === 'string') return tipo === 'date' && isDateOnly(valor) ? formatDateBR(valor) : valor;
  if (valor instanceof Date) return formatDateTimeBR(valor, fuso);
  switch (tipo) {
    case 'money':
      return formatBRL(valor);
    case 'percent':
      return formatPercent(valor);
    default:
      return formatNumber(valor);
  }
}
