import 'server-only';

import type { FinanceEntry, PrismaClient } from '@/generated/prisma/client';
import { addDays, dateOnlyToDb, dbToDateOnly, zonedTimeToInstant, type DateOnly } from '@/lib/dates';
import {
  financeCategoryLabel,
  financeEntryInputSchema,
  type FinanceEntryInput,
  type FinanceEntryTypeKey,
} from '@/lib/finance-entries';
import { percentChange, previousRange, type DateRange, type ParsedPeriod } from '@/lib/periods';
import { MONTH_LABELS } from '@/lib/weekdays';

import { recordAudit } from '../audit';
import { requirePermission, type AuthContext } from '../auth/context';
import type { Kpi } from '../dashboard/metrics';
import { prisma, type DbClient } from '../db';
import { Errors, fromZodError } from '../errors';
import type { RequestMeta } from '../request';
import { financeByMethod } from './service';

/**
 * Lançamentos manuais: receitas fora da venda de ingressos (bar, eventos, estacionamento) e
 * despesas do parque. Entram no resultado pela data de competência, pagos ou não.
 */

export interface FinanceEntryRow {
  id: string;
  type: FinanceEntryTypeKey;
  category: string;
  categoryLabel: string;
  description: string;
  amountCents: number;
  date: DateOnly;
  paid: boolean;
  notes: string | null;
}

function paraLinha(entrada: FinanceEntry): FinanceEntryRow {
  return {
    id: entrada.id,
    type: entrada.type,
    category: entrada.category,
    categoryLabel: financeCategoryLabel(entrada.type, entrada.category),
    description: entrada.description,
    amountCents: entrada.amountCents,
    date: dbToDateOnly(entrada.date),
    paid: entrada.paid,
    notes: entrada.notes,
  };
}

function validar(input: FinanceEntryInput) {
  const parsed = financeEntryInputSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const dados = parsed.data;
  return {
    type: dados.type,
    category: dados.category,
    description: dados.description,
    amountCents: dados.amountCents,
    date: dateOnlyToDb(dados.date),
    paid: dados.paid,
    notes: dados.notes,
  };
}

function resumo(entrada: FinanceEntry) {
  return {
    type: entrada.type,
    category: entrada.category,
    description: entrada.description,
    amountCents: entrada.amountCents,
    date: dbToDateOnly(entrada.date),
    paid: entrada.paid,
  };
}

function entreDatas(range: DateRange) {
  return { gte: dateOnlyToDb(range.from), lte: dateOnlyToDb(range.to) };
}

export async function listFinanceEntries(
  auth: AuthContext,
  filtro: { range: DateRange },
  db: DbClient = prisma,
): Promise<FinanceEntryRow[]> {
  requirePermission(auth, 'finance.view');
  const linhas = await db.financeEntry.findMany({
    where: { parkId: auth.park.id, date: entreDatas(filtro.range) },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 1000,
  });
  return linhas.map(paraLinha);
}

export async function createFinanceEntry(
  auth: AuthContext,
  input: FinanceEntryInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<FinanceEntryRow> {
  requirePermission(auth, 'finance.manage');
  const dados = validar(input);
  return db.$transaction(async (tx) => {
    const criada = await tx.financeEntry.create({
      data: { parkId: auth.park.id, createdById: auth.user.id, ...dados },
    });
    await recordAudit(tx, {
      action: 'finance.entry_created',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'finance_entry',
      entityId: criada.id,
      after: resumo(criada),
      meta,
    });
    return paraLinha(criada);
  });
}

export async function updateFinanceEntry(
  auth: AuthContext,
  id: string,
  input: FinanceEntryInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<FinanceEntryRow> {
  requirePermission(auth, 'finance.manage');
  const dados = validar(input);
  return db.$transaction(async (tx) => {
    const atual = await tx.financeEntry.findFirst({ where: { id, parkId: auth.park.id } });
    if (!atual) throw Errors.notFound('Lançamento não encontrado.');
    const alterada = await tx.financeEntry.update({ where: { id }, data: dados });
    await recordAudit(tx, {
      action: 'finance.entry_updated',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'finance_entry',
      entityId: id,
      before: resumo(atual),
      after: resumo(alterada),
      meta,
    });
    return paraLinha(alterada);
  });
}

export async function deleteFinanceEntry(
  auth: AuthContext,
  id: string,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<void> {
  requirePermission(auth, 'finance.manage');
  await db.$transaction(async (tx) => {
    const atual = await tx.financeEntry.findFirst({ where: { id, parkId: auth.park.id } });
    if (!atual) throw Errors.notFound('Lançamento não encontrado.');
    await tx.financeEntry.delete({ where: { id } });
    await recordAudit(tx, {
      action: 'finance.entry_deleted',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'finance_entry',
      entityId: id,
      before: resumo(atual),
      meta,
    });
  });
}

// ─── Visão geral: receitas x despesas ───────────────────────────────────────

export interface FinanceSlice {
  key: string;
  label: string;
  value: number;
}

export interface FinanceMonth {
  key: string;
  label: string;
  incomeCents: number;
  expensesCents: number;
  resultCents: number;
}

export interface FinanceOverview {
  /** Líquido dos ingressos + outras receitas lançadas. */
  income: Kpi;
  expenses: Kpi;
  result: Kpi;
  /** Resultado ÷ receitas; nulo sem receita. */
  margin: number | null;
  ticketNetCents: number;
  otherIncomeCents: number;
  toPay: { count: number; amountCents: number };
  toReceive: { count: number; amountCents: number };
  incomeComposition: FinanceSlice[];
  expensesByCategory: FinanceSlice[];
  months: FinanceMonth[];
}

function kpi(atual: number, anterior: number): Kpi {
  return { value: atual, previous: anterior, change: percentChange(atual, anterior) };
}

async function liquidoDosIngressos(db: DbClient, parkId: string, fuso: string, range: DateRange) {
  const inicio = zonedTimeToInstant(range.from, '00:00', fuso);
  const fim = zonedTimeToInstant(addDays(range.to, 1), '00:00', fuso);
  const linhas = await financeByMethod(db, parkId, inicio, fim);
  return linhas.reduce((soma, linha) => soma + linha.netCents, 0);
}

function gruposDoPeriodo(db: DbClient, parkId: string, range: DateRange) {
  return db.financeEntry.groupBy({
    by: ['type', 'category', 'paid'],
    where: { parkId, date: entreDatas(range) },
    _sum: { amountCents: true },
    _count: { _all: true },
  });
}

/** Os `quantidade` meses que terminam no mês da data. */
function mesesAte(data: DateOnly, quantidade: number): { key: string; label: string; range: DateRange }[] {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7)) - 1;
  return Array.from({ length: quantidade }, (_, indice) => {
    const inicio = new Date(Date.UTC(ano, mes - (quantidade - 1 - indice), 1));
    const anoDoMes = inicio.getUTCFullYear();
    const mesDoMes = inicio.getUTCMonth();
    const ultimoDia = new Date(Date.UTC(anoDoMes, mesDoMes + 1, 0)).getUTCDate();
    const chave = `${anoDoMes}-${String(mesDoMes + 1).padStart(2, '0')}`;
    const nome = MONTH_LABELS[mesDoMes] ?? '';
    return {
      key: chave,
      label: `${nome.slice(0, 3)}/${String(anoDoMes).slice(2)}`,
      range: { from: `${chave}-01`, to: `${chave}-${String(ultimoDia).padStart(2, '0')}` },
    };
  });
}

export async function getFinanceOverview(
  auth: AuthContext,
  periodo: ParsedPeriod,
  db: DbClient = prisma,
): Promise<FinanceOverview> {
  requirePermission(auth, 'finance.view');
  const parkId = auth.park.id;
  const fuso = auth.park.timezone;
  const anterior = previousRange(periodo.range);
  const meses = mesesAte(periodo.range.to, 6);
  const seisMeses = {
    from: meses[0]?.range.from ?? periodo.range.from,
    to: meses[meses.length - 1]?.range.to ?? periodo.range.to,
  };

  const [ingressos, ingressosAntes, grupos, gruposAntes, lancamentosDosMeses, ingressosPorMes] =
    await Promise.all([
      liquidoDosIngressos(db, parkId, fuso, periodo.range),
      liquidoDosIngressos(db, parkId, fuso, anterior),
      gruposDoPeriodo(db, parkId, periodo.range),
      gruposDoPeriodo(db, parkId, anterior),
      db.financeEntry.findMany({
        where: { parkId, date: entreDatas(seisMeses) },
        select: { type: true, amountCents: true, date: true },
      }),
      Promise.all(meses.map((mes) => liquidoDosIngressos(db, parkId, fuso, mes.range))),
    ]);

  type Grupo = (typeof grupos)[number];
  const somar = (lista: Grupo[], tipo: FinanceEntryTypeKey, pago?: boolean) =>
    lista
      .filter((grupo) => grupo.type === tipo && (pago === undefined || grupo.paid === pago))
      .reduce((soma, grupo) => soma + (grupo._sum.amountCents ?? 0), 0);
  const emAberto = (tipo: FinanceEntryTypeKey) =>
    grupos
      .filter((grupo) => grupo.type === tipo && !grupo.paid)
      .reduce(
        (total, grupo) => ({
          count: total.count + grupo._count._all,
          amountCents: total.amountCents + (grupo._sum.amountCents ?? 0),
        }),
        { count: 0, amountCents: 0 },
      );
  const porCategoria = (tipo: FinanceEntryTypeKey): FinanceSlice[] => {
    const valores = new Map<string, number>();
    for (const grupo of grupos) {
      if (grupo.type !== tipo) continue;
      valores.set(grupo.category, (valores.get(grupo.category) ?? 0) + (grupo._sum.amountCents ?? 0));
    }
    return [...valores]
      .map(([key, value]) => ({ key, label: financeCategoryLabel(tipo, key), value }))
      .filter((fatia) => fatia.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  const outras = somar(grupos, 'INCOME');
  const despesas = somar(grupos, 'EXPENSE');
  const receitas = ingressos + outras;
  const receitasAntes = ingressosAntes + somar(gruposAntes, 'INCOME');
  const despesasAntes = somar(gruposAntes, 'EXPENSE');

  return {
    income: kpi(receitas, receitasAntes),
    expenses: kpi(despesas, despesasAntes),
    result: kpi(receitas - despesas, receitasAntes - despesasAntes),
    margin: receitas > 0 ? (receitas - despesas) / receitas : null,
    ticketNetCents: ingressos,
    otherIncomeCents: outras,
    toPay: emAberto('EXPENSE'),
    toReceive: emAberto('INCOME'),
    incomeComposition: [
      { key: 'ingressos', label: 'Ingressos (líquido)', value: Math.max(0, ingressos) },
      ...porCategoria('INCOME'),
    ].filter((fatia) => fatia.value > 0),
    expensesByCategory: porCategoria('EXPENSE'),
    months: meses.map((mes, indice) => {
      let outrasDoMes = 0;
      let despesasDoMes = 0;
      for (const entrada of lancamentosDosMeses) {
        const dia = dbToDateOnly(entrada.date);
        if (dia < mes.range.from || dia > mes.range.to) continue;
        if (entrada.type === 'INCOME') outrasDoMes += entrada.amountCents;
        else despesasDoMes += entrada.amountCents;
      }
      const receitaDoMes = (ingressosPorMes[indice] ?? 0) + outrasDoMes;
      return {
        key: mes.key,
        label: mes.label,
        incomeCents: receitaDoMes,
        expensesCents: despesasDoMes,
        resultCents: receitaDoMes - despesasDoMes,
      };
    }),
  };
}
