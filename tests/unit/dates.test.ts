import { describe, expect, it } from 'vitest';

import {
  addDays,
  ageOn,
  compareDateOnly,
  dateOnlyToDb,
  dayBounds,
  dbToDateOnly,
  diffDays,
  formatDateBR,
  formatDateTimeBR,
  formatTimeBR,
  isDateOnly,
  isTimeOfDay,
  todayIn,
  weekdayOf,
  zonedTimeToInstant,
} from '@/lib/dates';

describe('todayIn', () => {
  it('usa o dia do parque, não o dia em UTC (22:30 na Bahia ainda é o mesmo dia)', () => {
    expect(todayIn('America/Bahia', new Date('2026-09-14T01:30:00Z'))).toBe('2026-09-13');
  });

  it('vira o dia à meia-noite do parque', () => {
    expect(todayIn('America/Bahia', new Date('2026-09-14T02:59:59Z'))).toBe('2026-09-13');
    expect(todayIn('America/Bahia', new Date('2026-09-14T03:00:00Z'))).toBe('2026-09-14');
  });
});

describe('formatação brasileira', () => {
  it('formata data civil sem passar por fuso', () => {
    expect(formatDateBR('2026-09-13')).toBe('13/09/2026');
    expect(formatDateBR('2027-01-01')).toBe('01/01/2027');
  });

  it('formata horário e data com hora no fuso do parque', () => {
    const instante = new Date('2026-09-13T17:30:00Z');
    expect(formatTimeBR(instante)).toBe('14:30');
    expect(formatDateTimeBR(instante)).toBe('13/09/2026 14:30');
  });

  it('recusa data inválida', () => {
    expect(() => formatDateBR('2026-02-30')).toThrow(RangeError);
    expect(() => formatDateBR('13/09/2026')).toThrow(RangeError);
  });
});

describe('validação', () => {
  it('reconhece datas civis reais', () => {
    expect(isDateOnly('2026-09-13')).toBe(true);
    expect(isDateOnly('2028-02-29')).toBe(true);
    expect(isDateOnly('2026-02-29')).toBe(false);
    expect(isDateOnly('2026-13-01')).toBe(false);
    expect(isDateOnly('26-09-13')).toBe(false);
    expect(isDateOnly('2026-09-13T00:00:00Z')).toBe(false);
  });

  it('reconhece horários HH:MM', () => {
    expect(isTimeOfDay('09:00')).toBe(true);
    expect(isTimeOfDay('23:59')).toBe(true);
    expect(isTimeOfDay('24:00')).toBe(false);
    expect(isTimeOfDay('9:00')).toBe(false);
  });
});

describe('aritmética de datas civis', () => {
  it('sabe o dia da semana', () => {
    expect(weekdayOf('2026-09-13')).toBe(0);
    expect(weekdayOf('2026-09-19')).toBe(6);
  });

  it('soma dias atravessando mês, ano e ano bissexto', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('conta dias entre datas e compara', () => {
    expect(diffDays('2026-09-13', '2026-09-20')).toBe(7);
    expect(diffDays('2026-09-20', '2026-09-13')).toBe(-7);
    expect(compareDateOnly('2026-09-13', '2026-09-14')).toBe(-1);
    expect(compareDateOnly('2026-09-14', '2026-09-14')).toBe(0);
  });

  it('calcula a idade completa na data da visita', () => {
    expect(ageOn('2014-09-14', '2026-09-13')).toBe(11);
    expect(ageOn('2014-09-13', '2026-09-13')).toBe(12);
    expect(ageOn('2020-02-29', '2026-02-28')).toBe(5);
    expect(ageOn('2020-02-29', '2026-03-01')).toBe(6);
  });
});

describe('fronteira com o banco e com instantes', () => {
  it('ida e volta de coluna date sem deslocar o dia', () => {
    const noBanco = dateOnlyToDb('2026-09-13');
    expect(noBanco.toISOString()).toBe('2026-09-13T00:00:00.000Z');
    expect(dbToDateOnly(noBanco)).toBe('2026-09-13');
  });

  it('converte horário local do parque em instante', () => {
    expect(zonedTimeToInstant('2026-09-13', '00:00').toISOString()).toBe('2026-09-13T03:00:00.000Z');
    expect(zonedTimeToInstant('2026-09-13', '14:30').toISOString()).toBe('2026-09-13T17:30:00.000Z');
  });

  it('funciona em fusos com horário de verão', () => {
    expect(zonedTimeToInstant('2026-03-07', '12:00', 'America/New_York').toISOString()).toBe(
      '2026-03-07T17:00:00.000Z',
    );
    expect(zonedTimeToInstant('2026-03-08', '12:00', 'America/New_York').toISOString()).toBe(
      '2026-03-08T16:00:00.000Z',
    );
  });

  it('delimita o dia do parque para relatórios', () => {
    const { start, end } = dayBounds('2026-09-13');
    expect(start.toISOString()).toBe('2026-09-13T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-14T03:00:00.000Z');
  });
});
