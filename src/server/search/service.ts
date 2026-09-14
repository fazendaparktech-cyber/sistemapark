import 'server-only';

import { formatDateBR } from '@/lib/dates';
import { formatPhoneBR } from '@/lib/documents';
import { formatBRL } from '@/lib/money';
import { SALE_STATUS_LABELS, TICKET_STATUS_LABELS } from '@/lib/orders';

import { can, type AuthContext } from '../auth/context';
import { listCustomers } from '../customers/service';
import { prisma, type DbClient } from '../db';
import { listOrders } from '../orders/admin';
import { listTickets } from '../tickets/service';

/**
 * Busca do topo do painel: clientes, vendas e ingressos por nome, CPF,
 * telefone, número do pedido ou código do ingresso. Cada grupo só aparece para
 * quem pode ver aquela área (`null` quando não pode).
 */

export const GLOBAL_SEARCH_MIN_LENGTH = 2;
const POR_GRUPO = 5;

export interface GlobalSearchHit {
  id: string;
  title: string;
  detail: string;
  href: string;
}

export interface GlobalSearchResult {
  query: string;
  customers: GlobalSearchHit[] | null;
  orders: GlobalSearchHit[] | null;
  tickets: GlobalSearchHit[] | null;
}

export async function globalSearch(
  auth: AuthContext,
  termo: string,
  db: DbClient = prisma,
): Promise<GlobalSearchResult> {
  const q = termo.trim().slice(0, 100);
  const verClientes = can(auth, 'customers.view');
  const verVendas = can(auth, 'orders.view');
  const verIngressos = can(auth, 'tickets.view');

  if (q.length < GLOBAL_SEARCH_MIN_LENGTH) {
    return {
      query: q,
      customers: verClientes ? [] : null,
      orders: verVendas ? [] : null,
      tickets: verIngressos ? [] : null,
    };
  }

  const [clientes, vendas, ingressos] = await Promise.all([
    verClientes ? listCustomers(auth, { q }, db) : null,
    verVendas ? listOrders(auth, { q }, db) : null,
    verIngressos ? listTickets(auth, { q }, db) : null,
  ]);

  return {
    query: q,
    customers: clientes
      ? clientes.items.slice(0, POR_GRUPO).map((cliente) => ({
          id: cliente.id,
          title: cliente.name,
          detail:
            [cliente.cpfMasked, cliente.phone ? formatPhoneBR(cliente.phone) : null, cliente.email]
              .filter(Boolean)
              .join(' · ') || 'Sem CPF, telefone ou e-mail',
          href: `/admin/clientes/${cliente.id}`,
        }))
      : null,
    orders: vendas
      ? vendas.items.slice(0, POR_GRUPO).map((pedido) => ({
          id: pedido.id,
          title: pedido.code,
          detail: `${pedido.buyerName} · ${SALE_STATUS_LABELS[pedido.saleStatus]} · ${formatBRL(pedido.totalCents)} · visita ${formatDateBR(pedido.visitDate)}`,
          href: `/admin/vendas/${pedido.id}`,
        }))
      : null,
    tickets: ingressos
      ? ingressos.items.slice(0, POR_GRUPO).map((ingresso) => ({
          id: ingresso.id,
          title: ingresso.code,
          detail: `${ingresso.holderName ?? ingresso.buyerName} · ${ingresso.typeName} · ${formatDateBR(ingresso.visitDate)} · ${TICKET_STATUS_LABELS[ingresso.status]}`,
          href: `/admin/ingressos/${ingresso.id}`,
        }))
      : null,
  };
}
