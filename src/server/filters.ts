import 'server-only';

import { CUSTOMER_SORTS } from '@/lib/customers';
import { isDateOnly, type DateOnly } from '@/lib/dates';
import { FINANCIAL_STATUSES, ORDER_CHANNELS, ORDER_STATUSES } from '@/lib/orders';

import type { CustomerListFilters } from './customers/service';
import type { OrderListFilters } from './orders/admin';

/**
 * Filtros das listas lidos da URL (páginas e planilhas usam os mesmos).
 * Valor inválido é ignorado: um link antigo ou editado à mão não quebra a tela.
 */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

function texto(valor: string | string[] | undefined, maximo = 100): string | undefined {
  const primeiro = Array.isArray(valor) ? valor[0] : valor;
  const limpo = primeiro?.trim();
  return limpo ? limpo.slice(0, maximo) : undefined;
}

function umDe<T extends string>(opcoes: readonly T[], valor: string | undefined): T | undefined {
  return valor !== undefined && (opcoes as readonly string[]).includes(valor) ? (valor as T) : undefined;
}

function data(valor: string | string[] | undefined): DateOnly | undefined {
  const bruto = texto(valor, 10);
  return bruto && isDateOnly(bruto) ? bruto : undefined;
}

export function pageParam(valor: string | string[] | undefined): number {
  const numero = Math.floor(Number(texto(valor, 6)));
  return Number.isFinite(numero) ? Math.max(1, Math.min(10_000, numero)) : 1;
}

export function parseOrderFilters(parametros: SearchParamsRecord): OrderListFilters {
  return {
    q: texto(parametros.q),
    status: umDe(ORDER_STATUSES, texto(parametros.situacao)),
    channel: umDe(ORDER_CHANNELS, texto(parametros.canal)),
    financial: umDe(FINANCIAL_STATUSES, texto(parametros.financeiro)),
    visitFrom: data(parametros.visitaDe),
    visitTo: data(parametros.visitaAte),
    createdFrom: data(parametros.compraDe),
    createdTo: data(parametros.compraAte),
    page: pageParam(parametros.pagina),
  };
}

export function parseCustomerFilters(parametros: SearchParamsRecord): CustomerListFilters {
  return {
    q: texto(parametros.q),
    sort: umDe(CUSTOMER_SORTS, texto(parametros.ordem)),
    marketing: texto(parametros.comunicacoes) === 'sim' ? true : undefined,
    page: pageParam(parametros.pagina),
  };
}

export function searchParamsOf(url: URL): SearchParamsRecord {
  return Object.fromEntries(url.searchParams.entries());
}
