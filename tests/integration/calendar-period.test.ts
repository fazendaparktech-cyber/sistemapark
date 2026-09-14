import { describe, expect, it } from 'vitest';

import { addDays, weekdayOf } from '@/lib/dates';
import { applyCalendarPeriod, getCalendarRange } from '@/server/calendar/service';

import { meta } from '../helpers/factories';
import { abrirDia, comprar, criarParqueDeVendas, criarTipo, dataFutura } from '../helpers/sales';

const fimDeSemana = (data: string) => weekdayOf(data) === 0 || weekdayOf(data) === 6;

function proximoDiaUtil(data: string): string {
  let dia = data;
  while (fimDeSemana(dia)) dia = addDays(dia, 1);
  return dia;
}

describe('configurar período do calendário', () => {
  it('ao abrir, só os dias da semana escolhidos ficam abertos e os demais fecham, menos os com venda', async () => {
    const { publico, auth } = await criarParqueDeVendas();
    const inicio = dataFutura(10);
    const fim = addDays(inicio, 13);

    // Dia útil já aberto e com venda: não pode ser fechado. Outro dia útil aberto sem venda: fecha.
    const comVenda = proximoDiaUtil(inicio);
    const semVenda = proximoDiaUtil(addDays(comVenda, 1));
    await abrirDia(publico.id, comVenda, 50);
    await abrirDia(publico.id, semVenda, 50);
    const tipo = await criarTipo(publico.id);
    await comprar(publico, comVenda, [{ ticketTypeId: tipo.id, quantity: 1 }]);

    const periodo = {
      from: inicio,
      to: fim,
      weekdays: [0, 6],
      status: 'OPEN' as const,
      opensAt: '09:00',
      closesAt: '17:00',
      capacity: 800,
    };
    const resultado = await applyCalendarPeriod(auth, periodo, meta());

    const calendario = await getCalendarRange(auth.park.id, inicio, fim);
    expect(calendario).toHaveLength(14);
    for (const dia of calendario) {
      if (dia.date === comVenda) {
        expect(dia).toMatchObject({ status: 'OPEN', capacity: 50 });
      } else if (fimDeSemana(dia.date)) {
        expect(dia).toMatchObject({ status: 'OPEN', opensAt: '09:00', closesAt: '17:00', capacity: 800 });
      } else {
        expect(dia.status).toBe('CLOSED');
      }
    }
    expect(resultado.conflicts).toEqual([{ date: comVenda, reason: expect.stringContaining('ingresso') }]);
    expect(resultado.opened + resultado.closed + resultado.unchanged + resultado.conflicts.length).toBe(14);

    // Aplicar de novo não muda nada.
    const repetido = await applyCalendarPeriod(auth, periodo, meta());
    expect(repetido).toMatchObject({ opened: 0, closed: 0, unchanged: 13 });

    // Ao fechar, só os dias escolhidos fecham: sábados fecham e domingos continuam abertos.
    await applyCalendarPeriod(
      auth,
      { from: inicio, to: fim, weekdays: [6], status: 'CLOSED', capacity: 800 },
      meta(),
    );
    const depois = await getCalendarRange(auth.park.id, inicio, fim);
    expect(depois.filter((dia) => weekdayOf(dia.date) === 6).every((dia) => dia.status === 'CLOSED')).toBe(
      true,
    );
    expect(depois.filter((dia) => weekdayOf(dia.date) === 0).every((dia) => dia.status === 'OPEN')).toBe(
      true,
    );
    expect(depois.find((dia) => dia.date === comVenda)?.status).toBe('OPEN');
  });
});
