import { describe, expect, it } from 'vitest';

import { todayIn } from '@/lib/dates';
import { parsePeriod } from '@/lib/periods';
import {
  createFinanceEntry,
  deleteFinanceEntry,
  getFinanceOverview,
  listFinanceEntries,
  updateFinanceEntry,
} from '@/server/finance/entries';

import { expectAppError, lastAudit, meta } from '../helpers/factories';
import { criarParqueDeVendas } from '../helpers/sales';

describe('lançamentos do financeiro', () => {
  it('lança, altera e exclui receitas e despesas e calcula o resultado do período', async () => {
    const { auth } = await criarParqueDeVendas();
    const hoje = todayIn(auth.park.timezone);
    const periodo = parsePeriod({ periodo: 'mes', de: undefined, ate: undefined }, hoje, 'mes');
    const base = { date: hoje, paid: true };

    const energia = await createFinanceEntry(
      auth,
      {
        ...base,
        type: 'EXPENSE',
        category: 'energia',
        description: 'Conta de energia',
        amountCents: 120_000,
      },
      meta(),
    );
    await createFinanceEntry(
      auth,
      {
        ...base,
        type: 'EXPENSE',
        category: 'manutencao',
        description: 'Bomba da piscina',
        amountCents: 30_000,
        paid: false,
      },
      meta(),
    );
    const bar = await createFinanceEntry(
      auth,
      {
        ...base,
        type: 'INCOME',
        category: 'alimentacao',
        description: 'Bar do fim de semana',
        amountCents: 50_000,
      },
      meta(),
    );

    await expectAppError(
      createFinanceEntry(
        auth,
        {
          ...base,
          type: 'INCOME',
          category: 'energia',
          description: 'Categoria de despesa',
          amountCents: 100,
        },
        meta(),
      ),
      'VALIDATION_ERROR',
    );
    await expectAppError(
      createFinanceEntry(
        auth,
        { ...base, type: 'EXPENSE', category: 'agua', description: 'Sem valor', amountCents: 0 },
        meta(),
      ),
      'VALIDATION_ERROR',
    );

    await updateFinanceEntry(
      auth,
      energia.id,
      {
        ...base,
        type: 'EXPENSE',
        category: 'energia',
        description: 'Conta de energia de setembro',
        amountCents: 100_000,
      },
      meta(),
    );
    expect(await lastAudit('finance.entry_updated', energia.id)).toBeTruthy();

    const visao = await getFinanceOverview(auth, periodo);
    expect(visao.otherIncomeCents).toBe(50_000);
    expect(visao.expenses.value).toBe(130_000);
    expect(visao.income.value).toBe(visao.ticketNetCents + 50_000);
    expect(visao.result.value).toBe(visao.income.value - 130_000);
    expect(visao.toPay).toEqual({ count: 1, amountCents: 30_000 });
    expect(visao.expensesByCategory).toEqual([
      { key: 'energia', label: 'Energia elétrica', value: 100_000 },
      { key: 'manutencao', label: 'Manutenção', value: 30_000 },
    ]);
    expect(visao.months).toHaveLength(6);
    expect(visao.months.at(-1)).toMatchObject({ key: hoje.slice(0, 7), expensesCents: 130_000 });

    await deleteFinanceEntry(auth, bar.id, meta());
    const lista = await listFinanceEntries(auth, { range: periodo.range });
    expect(lista.map((item) => item.description).sort()).toEqual([
      'Bomba da piscina',
      'Conta de energia de setembro',
    ]);
  });

  it('só lança quem tem permissão', async () => {
    const { auth } = await criarParqueDeVendas(['GATE']);
    await expectAppError(
      createFinanceEntry(
        auth,
        {
          type: 'EXPENSE',
          category: 'agua',
          description: 'Conta de água',
          amountCents: 5_000,
          date: todayIn(auth.park.timezone),
          paid: true,
        },
        meta(),
      ),
      'FORBIDDEN',
    );
  });
});
