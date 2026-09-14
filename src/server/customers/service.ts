import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import {
  customerCreateSchema,
  customerUpdateSchema,
  type CustomerCreateInput,
  type CustomerSort,
  type CustomerUpdateInput,
} from '@/lib/customers';
import {
  dateOnlyToDb,
  dbToDateOnly,
  formatDateBR,
  formatDateTimeBR,
  todayIn,
  type DateOnly,
} from '@/lib/dates';
import { formatPhoneBR, isValidCpf, maskCpf, onlyDigits } from '@/lib/documents';
import {
  effectiveOrderStatus,
  saleStatusOf,
  type FinancialStatusKey,
  type OrderChannelKey,
  type OrderStatusKey,
  type SaleStatusKey,
  type TicketStatusKey,
} from '@/lib/orders';
import { effectiveTicketStatus } from '@/lib/tickets';

import { recordAudit } from '../audit';
import { requirePermission, type AuthContext } from '../auth/context';
import { centsToCsv, toCsv } from '../csv';
import { prisma, type DbClient, type Tx } from '../db';
import { AppError, Errors, fromZodError } from '../errors';
import { isUniqueViolation } from '../prisma-errors';
import { rawDateOnly, rawNumber } from '../raw';
import type { RequestMeta } from '../request';
import { hashCpf } from '../signing';

/**
 * Clientes: quem compra ingresso, identificado pelo CPF (guardado só como
 * HMAC). Uma compra com um CPF já cadastrado não sobrescreve nome e contato do
 * cadastro — o pedido guarda o contato usado naquela compra.
 */

export const CUSTOMERS_PAGE_SIZE = 25;
const LIMITE_EXPORTACAO = 50_000;

/** Encontra o cliente pelo CPF ou cadastra. Só completa dados que estavam vazios. */
export async function upsertCustomerByCpf(
  tx: Tx,
  input: {
    parkId: string;
    name: string;
    email: string | null;
    phone: string | null;
    cpfDigits: string;
    marketingOptIn: boolean;
  },
): Promise<{ id: string }> {
  const cpfHash = hashCpf(input.cpfDigits);
  const chave = { parkId_cpfHash: { parkId: input.parkId, cpfHash } };
  const existente = await tx.customer.findUnique({
    where: chave,
    select: { id: true, phone: true, marketingOptIn: true },
  });
  if (existente) {
    const complemento = {
      ...(!existente.phone && input.phone ? { phone: input.phone } : {}),
      ...(input.marketingOptIn && !existente.marketingOptIn ? { marketingOptIn: true } : {}),
    };
    if (Object.keys(complemento).length > 0) {
      await tx.customer.update({ where: { id: existente.id }, data: complemento });
    }
    return { id: existente.id };
  }

  // Duas compras simultâneas com o mesmo CPF: a segunda espera a primeira e usa o mesmo cadastro.
  await tx.customer.createMany({
    data: [
      {
        parkId: input.parkId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        cpfHash,
        cpfMasked: maskCpf(input.cpfDigits),
        marketingOptIn: input.marketingOptIn,
      },
    ],
    skipDuplicates: true,
  });
  return tx.customer.findUniqueOrThrow({ where: chave, select: { id: true } });
}

// ─── Lista ──────────────────────────────────────────────────────────────────

export interface CustomerListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfMasked: string | null;
  marketingOptIn: boolean;
  createdAt: Date;
  ordersCount: number;
  ticketsCount: number;
  /** Dias diferentes com entrada registrada na portaria. */
  visitsCount: number;
  totalSpentCents: number;
  lastOrderAt: Date | null;
  /** Último dia com entrada na portaria. */
  lastVisitDate: DateOnly | null;
  /** Próxima data com ingresso válido (hoje ou depois). */
  nextVisitDate: DateOnly | null;
}

export interface CustomerListFilters {
  q?: string;
  sort?: CustomerSort;
  marketing?: boolean;
  page?: number;
}

interface Busca {
  texto: string | null;
  telefone: string | null;
  cpfHash: string | null;
}

function interpretarBusca(q: string | undefined): Busca {
  const texto = q?.trim() ?? '';
  if (!texto) return { texto: null, telefone: null, cpfHash: null };
  const digitos = onlyDigits(texto);
  if (/^[\d\s().+-]+$/.test(texto) && digitos.length >= 8) {
    return {
      texto: null,
      telefone: `%${digitos}%`,
      cpfHash: digitos.length === 11 && isValidCpf(digitos) ? hashCpf(digitos) : null,
    };
  }
  return { texto: `%${texto.replace(/[\\%_]/g, '\\$&')}%`, telefone: null, cpfHash: null };
}

interface LinhaDeCliente {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf_masked: string | null;
  marketing_opt_in: boolean;
  created_at: Date;
  orders_count: number;
  tickets_count: number;
  visits_count: number;
  total_spent: bigint | number;
  last_order_at: Date | null;
  last_visit_date: Date | string | null;
  next_visit_date: Date | string | null;
  total: number;
}

async function consultarClientes(
  db: DbClient,
  parkId: string,
  hoje: DateOnly,
  filtros: CustomerListFilters,
  limite: number,
  deslocamento: number,
): Promise<{ items: CustomerListItem[]; total: number }> {
  const busca = interpretarBusca(filtros.q);
  const ordem = filtros.sort ?? 'recentes';
  const marketing = filtros.marketing ?? null;

  const linhas = await db.$queryRaw<LinhaDeCliente[]>`
    WITH base AS (
      SELECT c.id, c.name, c.email, c.phone, c.cpf_masked, c.marketing_opt_in, c.created_at,
        COALESCE(o.orders_count, 0) AS orders_count,
        COALESCE(o.total_spent, 0) AS total_spent,
        o.last_order_at,
        COALESCE(t.tickets_count, 0) AS tickets_count,
        COALESCE(t.visits_count, 0) AS visits_count,
        t.last_visit_date,
        t.next_visit_date
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS orders_count, SUM(total_cents)::bigint AS total_spent,
          MAX(confirmed_at) AS last_order_at
        FROM orders
        WHERE customer_id = c.id AND status = 'CONFIRMED'
      ) o ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'CHECKED_IN'))::int AS tickets_count,
          COUNT(DISTINCT visit_date) FILTER (WHERE status = 'CHECKED_IN')::int AS visits_count,
          MAX(visit_date) FILTER (WHERE status = 'CHECKED_IN') AS last_visit_date,
          MIN(visit_date) FILTER (WHERE status = 'ACTIVE' AND visit_date >= ${hoje}::date) AS next_visit_date
        FROM tickets
        WHERE customer_id = c.id
      ) t ON true
      WHERE c.park_id = ${parkId}::uuid
        AND (${marketing}::boolean IS NULL OR c.marketing_opt_in = ${marketing}::boolean)
        AND (
          (${busca.texto}::text IS NULL AND ${busca.telefone}::text IS NULL)
          OR c.name ILIKE ${busca.texto}::text
          OR c.email ILIKE ${busca.texto}::text
          OR c.phone LIKE ${busca.telefone}::text
          OR c.cpf_hash = ${busca.cpfHash}::text
        )
    )
    SELECT *, COUNT(*) OVER ()::int AS total
    FROM base
    ORDER BY
      CASE WHEN ${ordem}::text = 'gasto' THEN total_spent END DESC NULLS LAST,
      CASE WHEN ${ordem}::text = 'pedidos' THEN orders_count END DESC NULLS LAST,
      CASE WHEN ${ordem}::text = 'ultima-visita' THEN last_visit_date END DESC NULLS LAST,
      CASE WHEN ${ordem}::text = 'nome' THEN name END ASC,
      created_at DESC,
      id DESC
    LIMIT ${limite}::int OFFSET ${deslocamento}::int`;

  let total = linhas[0]?.total ?? 0;
  if (linhas.length === 0 && deslocamento > 0) {
    const contagem = await consultarClientes(db, parkId, hoje, filtros, 1, 0);
    total = contagem.total;
  }

  return {
    total,
    items: linhas.map((linha) => ({
      id: linha.id,
      name: linha.name,
      email: linha.email,
      phone: linha.phone,
      cpfMasked: linha.cpf_masked,
      marketingOptIn: linha.marketing_opt_in,
      createdAt: linha.created_at,
      ordersCount: linha.orders_count,
      ticketsCount: linha.tickets_count,
      visitsCount: linha.visits_count,
      totalSpentCents: rawNumber(linha.total_spent),
      lastOrderAt: linha.last_order_at,
      lastVisitDate: rawDateOnly(linha.last_visit_date),
      nextVisitDate: rawDateOnly(linha.next_visit_date),
    })),
  };
}

export async function listCustomers(
  auth: AuthContext,
  filtros: CustomerListFilters = {},
  db: DbClient = prisma,
): Promise<{ items: CustomerListItem[]; total: number; page: number; pageSize: number }> {
  requirePermission(auth, 'customers.view');
  const pagina = Math.max(1, Math.floor(filtros.page ?? 1));
  const { items, total } = await consultarClientes(
    db,
    auth.park.id,
    todayIn(auth.park.timezone),
    filtros,
    CUSTOMERS_PAGE_SIZE,
    (pagina - 1) * CUSTOMERS_PAGE_SIZE,
  );
  return { items, total, page: pagina, pageSize: CUSTOMERS_PAGE_SIZE };
}

export interface CustomerSummary {
  total: number;
  newLast30Days: number;
  marketingOptIn: number;
  returning: number;
}

export async function getCustomerSummary(auth: AuthContext, db: DbClient = prisma): Promise<CustomerSummary> {
  requirePermission(auth, 'customers.view');
  const [cadastro, recorrentes] = await Promise.all([
    db.$queryRaw<{ total: number; novos: number; marketing: number }[]>`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS novos,
        COUNT(*) FILTER (WHERE marketing_opt_in)::int AS marketing
      FROM customers
      WHERE park_id = ${auth.park.id}::uuid`,
    db.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT customer_id
        FROM orders
        WHERE park_id = ${auth.park.id}::uuid AND status = 'CONFIRMED' AND customer_id IS NOT NULL
        GROUP BY customer_id
        HAVING COUNT(*) >= 2
      ) recorrentes`,
  ]);
  return {
    total: cadastro[0]?.total ?? 0,
    newLast30Days: cadastro[0]?.novos ?? 0,
    marketingOptIn: cadastro[0]?.marketing ?? 0,
    returning: recorrentes[0]?.total ?? 0,
  };
}

// ─── Ficha ──────────────────────────────────────────────────────────────────

export interface CustomerOrderRow {
  id: string;
  code: string;
  status: OrderStatusKey;
  saleStatus: SaleStatusKey;
  financialStatus: FinancialStatusKey;
  channel: OrderChannelKey;
  visitDate: DateOnly;
  ticketsCount: number;
  totalCents: number;
  discountCents: number;
  couponCode: string | null;
  createdAt: Date;
}

export interface CustomerDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfMasked: string | null;
  birthDate: DateOnly | null;
  marketingOptIn: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  stats: {
    ordersCount: number;
    ticketsCount: number;
    visitsCount: number;
    totalSpentCents: number;
    discountCents: number;
    averageOrderCents: number | null;
    firstOrderAt: Date | null;
    /** Último dia com entrada na portaria. */
    lastVisitDate: DateOnly | null;
    /** Próxima data com ingresso válido. */
    nextVisitDate: DateOnly | null;
  };
  orders: CustomerOrderRow[];
  tickets: {
    id: string;
    code: string;
    typeName: string;
    holderName: string | null;
    visitDate: DateOnly;
    status: TicketStatusKey;
    checkedInAt: Date | null;
    orderCode: string;
  }[];
  visits: { date: DateOnly; entries: number; firstEntryAt: Date | null }[];
}

export async function getCustomerDetail(
  auth: AuthContext,
  id: string,
  db: DbClient = prisma,
): Promise<CustomerDetail> {
  requirePermission(auth, 'customers.view');
  const cliente = await db.customer.findFirst({ where: { id, parkId: auth.park.id } });
  if (!cliente) throw Errors.notFound('Cliente não encontrado.');

  const hoje = todayIn(auth.park.timezone);
  const [pedidos, resumo, ingressos, listaDeIngressos, visitas] = await Promise.all([
    db.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        code: true,
        status: true,
        expiresAt: true,
        financialStatus: true,
        channel: true,
        visitDate: true,
        totalCents: true,
        discountCents: true,
        createdAt: true,
        coupon: { select: { code: true } },
        _count: { select: { tickets: true } },
      },
    }),
    db.$queryRaw<
      {
        orders: number;
        spent: bigint | number;
        discount: bigint | number;
        first_order_at: Date | null;
        last_visit_date: Date | string | null;
      }[]
    >`
      SELECT COUNT(*)::int AS orders,
        COALESCE(SUM(total_cents), 0)::bigint AS spent,
        COALESCE(SUM(discount_cents), 0)::bigint AS discount,
        MIN(confirmed_at) AS first_order_at,
        MAX(visit_date) AS last_visit_date
      FROM orders
      WHERE customer_id = ${id}::uuid AND status = 'CONFIRMED'`,
    db.$queryRaw<
      {
        tickets: number;
        visits: number;
        last_visit: Date | string | null;
        next_visit: Date | string | null;
      }[]
    >`
      SELECT COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'CHECKED_IN'))::int AS tickets,
        COUNT(DISTINCT visit_date) FILTER (WHERE status = 'CHECKED_IN')::int AS visits,
        MAX(visit_date) FILTER (WHERE status = 'CHECKED_IN') AS last_visit,
        MIN(visit_date) FILTER (WHERE status = 'ACTIVE' AND visit_date >= ${hoje}::date) AS next_visit
      FROM tickets
      WHERE customer_id = ${id}::uuid`,
    db.ticket.findMany({
      where: { customerId: id },
      orderBy: [{ visitDate: 'desc' }, { code: 'asc' }],
      take: 100,
      select: {
        id: true,
        code: true,
        status: true,
        visitDate: true,
        holderName: true,
        checkedInAt: true,
        ticketType: { select: { name: true } },
        order: { select: { code: true } },
      },
    }),
    db.$queryRaw<{ date: Date | string; entries: number; first_entry: Date | null }[]>`
      SELECT visit_date AS date, COUNT(*)::int AS entries, MIN(checked_in_at) AS first_entry
      FROM tickets
      WHERE customer_id = ${id}::uuid AND status = 'CHECKED_IN'
      GROUP BY visit_date
      ORDER BY visit_date DESC
      LIMIT 100`,
  ]);

  const linha = resumo[0];
  const quantidade = linha?.orders ?? 0;
  const gasto = rawNumber(linha?.spent);
  const agora = new Date();

  return {
    id: cliente.id,
    name: cliente.name,
    email: cliente.email,
    phone: cliente.phone,
    cpfMasked: cliente.cpfMasked,
    birthDate: cliente.birthDate ? dbToDateOnly(cliente.birthDate) : null,
    marketingOptIn: cliente.marketingOptIn,
    notes: cliente.notes,
    createdAt: cliente.createdAt,
    updatedAt: cliente.updatedAt,
    stats: {
      ordersCount: quantidade,
      ticketsCount: ingressos[0]?.tickets ?? 0,
      visitsCount: ingressos[0]?.visits ?? 0,
      totalSpentCents: gasto,
      discountCents: rawNumber(linha?.discount),
      averageOrderCents: quantidade > 0 ? Math.round(gasto / quantidade) : null,
      firstOrderAt: linha?.first_order_at ?? null,
      lastVisitDate: rawDateOnly(ingressos[0]?.last_visit),
      nextVisitDate: rawDateOnly(ingressos[0]?.next_visit),
    },
    orders: pedidos.map((pedido) => ({
      id: pedido.id,
      code: pedido.code,
      status: effectiveOrderStatus(pedido, agora),
      saleStatus: saleStatusOf(pedido, agora),
      financialStatus: pedido.financialStatus,
      channel: pedido.channel,
      visitDate: dbToDateOnly(pedido.visitDate),
      ticketsCount: pedido._count.tickets,
      totalCents: pedido.totalCents,
      discountCents: pedido.discountCents,
      couponCode: pedido.coupon?.code ?? null,
      createdAt: pedido.createdAt,
    })),
    tickets: listaDeIngressos.map((ingresso) => {
      const visitDate = dbToDateOnly(ingresso.visitDate);
      return {
        id: ingresso.id,
        code: ingresso.code,
        typeName: ingresso.ticketType.name,
        holderName: ingresso.holderName,
        visitDate,
        status: effectiveTicketStatus({ status: ingresso.status, visitDate }, hoje),
        checkedInAt: ingresso.checkedInAt,
        orderCode: ingresso.order.code,
      };
    }),
    visits: visitas.map((visita) => ({
      date: rawDateOnly(visita.date) ?? '',
      entries: visita.entries,
      firstEntryAt: visita.first_entry,
    })),
  };
}

// ─── Cadastro e edição ──────────────────────────────────────────────────────

function cpfJaCadastrado(outro: { id: string; name: string }): AppError {
  return new AppError('CONFLICT', `Este CPF já está no cadastro de ${outro.name}.`, {
    details: { customerId: outro.id, fields: { cpf: 'CPF já cadastrado para outro cliente' } },
  });
}

/** Cadastro feito pela equipe (cliente do balcão, grupo, cliente sem compra ainda). */
export async function createCustomer(
  auth: AuthContext,
  input: CustomerCreateInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<{ id: string }> {
  requirePermission(auth, 'customers.manage');
  const parsed = customerCreateSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const valores = parsed.data;
  const cpfHash = valores.cpf ? hashCpf(valores.cpf) : null;

  try {
    return await db.$transaction(async (tx) => {
      if (cpfHash) {
        const outro = await tx.customer.findUnique({
          where: { parkId_cpfHash: { parkId: auth.park.id, cpfHash } },
          select: { id: true, name: true },
        });
        if (outro) throw cpfJaCadastrado(outro);
      }
      const criado = await tx.customer.create({
        data: {
          parkId: auth.park.id,
          name: valores.name,
          email: valores.email,
          phone: valores.phone,
          birthDate: valores.birthDate ? dateOnlyToDb(valores.birthDate) : null,
          cpfHash,
          cpfMasked: valores.cpf ? maskCpf(valores.cpf) : null,
          marketingOptIn: valores.marketingOptIn,
          notes: valores.notes,
        },
        select: { id: true },
      });
      await recordAudit(tx, {
        action: 'customers.created',
        parkId: auth.park.id,
        actorUserId: auth.user.id,
        entityType: 'customer',
        entityId: criado.id,
        after: {
          name: valores.name,
          email: valores.email,
          phone: valores.phone,
          cpf: valores.cpf ? maskCpf(valores.cpf) : null,
          marketingOptIn: valores.marketingOptIn,
        },
        meta,
      });
      return criado;
    });
  } catch (erro) {
    if (cpfHash && isUniqueViolation(erro)) {
      const outro = await db.customer.findUnique({
        where: { parkId_cpfHash: { parkId: auth.park.id, cpfHash } },
        select: { id: true, name: true },
      });
      if (outro) throw cpfJaCadastrado(outro);
    }
    throw erro;
  }
}

export async function updateCustomer(
  auth: AuthContext,
  id: string,
  input: CustomerUpdateInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<CustomerDetail> {
  requirePermission(auth, 'customers.manage');
  const parsed = customerUpdateSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const valores = parsed.data;

  await db.$transaction(async (tx) => {
    const atual = await tx.customer.findFirst({ where: { id, parkId: auth.park.id } });
    if (!atual) throw Errors.notFound('Cliente não encontrado.');

    // O CPF pode ser incluído num cadastro sem CPF, mas não trocado.
    const cpfHash = valores.cpf ? hashCpf(valores.cpf) : null;
    if (cpfHash && atual.cpfHash && cpfHash !== atual.cpfHash) {
      const mensagem = 'O CPF não pode ser trocado: é ele que identifica o cliente nas compras.';
      throw new AppError('VALIDATION_ERROR', mensagem, { details: { fields: { cpf: mensagem } } });
    }
    const incluirCpf = cpfHash !== null && atual.cpfHash === null && valores.cpf !== null;
    if (incluirCpf) {
      const outro = await tx.customer.findUnique({
        where: { parkId_cpfHash: { parkId: auth.park.id, cpfHash } },
        select: { id: true, name: true },
      });
      if (outro) throw cpfJaCadastrado(outro);
    }

    await tx.customer.update({
      where: { id },
      data: {
        name: valores.name,
        email: valores.email,
        phone: valores.phone,
        birthDate: valores.birthDate ? dateOnlyToDb(valores.birthDate) : null,
        marketingOptIn: valores.marketingOptIn,
        notes: valores.notes,
        ...(incluirCpf && valores.cpf ? { cpfHash, cpfMasked: maskCpf(valores.cpf) } : {}),
      },
    });
    await recordAudit(tx, {
      action: 'customers.updated',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'customer',
      entityId: id,
      before: {
        name: atual.name,
        email: atual.email,
        phone: atual.phone,
        birthDate: atual.birthDate ? dbToDateOnly(atual.birthDate) : null,
        marketingOptIn: atual.marketingOptIn,
      },
      after: {
        name: valores.name,
        email: valores.email,
        phone: valores.phone,
        birthDate: valores.birthDate,
        marketingOptIn: valores.marketingOptIn,
      },
      data: atual.notes !== valores.notes ? { notesChanged: true } : undefined,
      meta,
    });
  });
  return getCustomerDetail(auth, id, db);
}

/** Exportação para planilha. Dado pessoal: fica registrada na auditoria. */
export async function exportCustomersCsv(
  auth: AuthContext,
  filtros: Omit<CustomerListFilters, 'page'>,
  meta: RequestMeta,
  db: DbClient = prisma,
): Promise<{ filename: string; content: string }> {
  requirePermission(auth, 'customers.view', 'customers.export');
  const { items } = await consultarClientes(
    db,
    auth.park.id,
    todayIn(auth.park.timezone),
    filtros,
    LIMITE_EXPORTACAO,
    0,
  );
  const content = toCsv(
    [
      'Nome',
      'E-mail',
      'Celular',
      'CPF',
      'Aceita comunicações',
      'Compras',
      'Ingressos',
      'Visitas',
      'Total gasto (R$)',
      'Última compra',
      'Última visita',
      'Próxima visita',
      'Cadastro',
    ],
    items.map((cliente) => [
      cliente.name,
      cliente.email,
      cliente.phone ? formatPhoneBR(cliente.phone) : null,
      cliente.cpfMasked,
      cliente.marketingOptIn,
      cliente.ordersCount,
      cliente.ticketsCount,
      cliente.visitsCount,
      centsToCsv(cliente.totalSpentCents),
      cliente.lastOrderAt ? formatDateTimeBR(cliente.lastOrderAt, auth.park.timezone) : null,
      cliente.lastVisitDate ? formatDateBR(cliente.lastVisitDate) : null,
      cliente.nextVisitDate ? formatDateBR(cliente.nextVisitDate) : null,
      formatDateTimeBR(cliente.createdAt, auth.park.timezone),
    ]),
  );
  await recordAudit(db, {
    action: 'customers.exported',
    parkId: auth.park.id,
    actorUserId: auth.user.id,
    entityType: 'customer',
    data: { rows: items.length, q: filtros.q ?? null, marketing: filtros.marketing ?? null },
    meta,
  });
  return { filename: `clientes-${todayIn(auth.park.timezone)}.csv`, content };
}
