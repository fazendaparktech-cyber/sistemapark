/**
 * Datas do parque.
 *
 * Duas coisas diferentes, que nunca se misturam:
 * - **Data civil** (`"2026-09-13"`): o dia da visita. Não tem hora nem fuso.
 *   No banco é `date`.
 * - **Instante** (`Date`): quando algo aconteceu — compra, pagamento, check-in.
 *   No banco é `timestamptz`.
 *
 * "Hoje" é sempre o dia civil no fuso do parque, calculado no servidor. O relógio
 * e o fuso do aparelho de quem acessa não entram na conta.
 */

export const DEFAULT_PARK_TIMEZONE = 'America/Bahia';

/** Data civil no formato `AAAA-MM-DD`. */
export type DateOnly = string;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatadores.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatadores.set(timeZone, fmt);
  }
  return fmt;
}

interface PartesLocais {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partesLocais(instant: Date, timeZone: string): PartesLocais {
  const partes: Record<string, string> = {};
  for (const parte of formatador(timeZone).formatToParts(instant)) partes[parte.type] = parte.value;
  return {
    year: Number(partes.year),
    month: Number(partes.month),
    day: Number(partes.day),
    hour: Number(partes.hour),
    minute: Number(partes.minute),
    second: Number(partes.second),
  };
}

function doisDigitos(n: number): string {
  return n.toString().padStart(2, '0');
}

function decompor(date: DateOnly): [number, number, number] {
  const m = DATE_ONLY.exec(date);
  if (!m || !isDateOnly(date)) throw new RangeError(`Data inválida: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isDateOnly(value: string): boolean {
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 1900 || ano > 2999) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export function isTimeOfDay(value: string): boolean {
  return TIME.test(value);
}

/** Dia civil de agora no fuso informado. Às 22:30 de 13/09 na Bahia, ainda é 13/09. */
export function todayIn(timeZone: string = DEFAULT_PARK_TIMEZONE, now: Date = new Date()): DateOnly {
  const p = partesLocais(now, timeZone);
  return `${p.year}-${doisDigitos(p.month)}-${doisDigitos(p.day)}`;
}

/** "2026-09-13" → "13/09/2026". Não passa por fuso: é só a data civil. */
export function formatDateBR(date: DateOnly): string {
  const [ano, mes, dia] = decompor(date);
  return `${doisDigitos(dia)}/${doisDigitos(mes)}/${ano}`;
}

/** Instante → "14:30" no fuso do parque. */
export function formatTimeBR(instant: Date, timeZone: string = DEFAULT_PARK_TIMEZONE): string {
  const p = partesLocais(instant, timeZone);
  return `${doisDigitos(p.hour)}:${doisDigitos(p.minute)}`;
}

/** Instante → "13/09/2026 14:30" no fuso do parque. */
export function formatDateTimeBR(instant: Date, timeZone: string = DEFAULT_PARK_TIMEZONE): string {
  const p = partesLocais(instant, timeZone);
  return `${doisDigitos(p.day)}/${doisDigitos(p.month)}/${p.year} ${doisDigitos(p.hour)}:${doisDigitos(p.minute)}`;
}

/** Dia civil em que um instante cai, no fuso do parque. */
export function dateOnlyOf(instant: Date, timeZone: string = DEFAULT_PARK_TIMEZONE): DateOnly {
  return todayIn(timeZone, instant);
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(date: DateOnly): number {
  const [ano, mes, dia] = decompor(date);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const [ano, mes, dia] = decompor(date);
  const d = new Date(Date.UTC(ano, mes - 1, dia + days));
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
}

/** Dias corridos de `from` até `to` (negativo se `to` for antes). */
export function diffDays(from: DateOnly, to: DateOnly): number {
  const [a1, m1, d1] = decompor(from);
  const [a2, m2, d2] = decompor(to);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function compareDateOnly(a: DateOnly, b: DateOnly): number {
  decompor(a);
  decompor(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Idade completa em anos numa data (ex.: a data da visita). */
export function ageOn(birthDate: DateOnly, on: DateOnly): number {
  const [an, mn, dn] = decompor(birthDate);
  const [ad, md, dd] = decompor(on);
  let idade = ad - an;
  if (md < mn || (md === mn && dd < dn)) idade -= 1;
  return idade;
}

/**
 * Converte a data civil para o `Date` que o Prisma usa em colunas `date`
 * (meia-noite UTC). Só serve para gravar e ler do banco.
 */
export function dateOnlyToDb(date: DateOnly): Date {
  const [ano, mes, dia] = decompor(date);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Lê uma coluna `date` vinda do Prisma de volta para `AAAA-MM-DD`. */
export function dbToDateOnly(value: Date): DateOnly {
  return value.toISOString().slice(0, 10);
}

function deslocamentoMinutos(instant: Date, timeZone: string): number {
  const p = partesLocais(instant, timeZone);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((comoUtc - instant.getTime()) / 60_000);
}

/**
 * Instante em que um horário local acontece: ("2026-09-13", "00:00", Bahia) →
 * 2026-09-13T03:00:00Z. Serve para limites de relatório por dia do parque.
 */
export function zonedTimeToInstant(
  date: DateOnly,
  time: string,
  timeZone: string = DEFAULT_PARK_TIMEZONE,
): Date {
  const [ano, mes, dia] = decompor(date);
  const m = TIME.exec(time);
  if (!m) throw new RangeError(`Horário inválido: ${time}`);
  const palpite = Date.UTC(ano, mes - 1, dia, Number(m[1]), Number(m[2]));
  const primeiro = deslocamentoMinutos(new Date(palpite), timeZone);
  let instante = palpite - primeiro * 60_000;
  const segundo = deslocamentoMinutos(new Date(instante), timeZone);
  if (segundo !== primeiro) instante = palpite - segundo * 60_000;
  return new Date(instante);
}

/** Início (inclusivo) e fim (exclusivo) de um dia civil do parque, em instantes. */
export function dayBounds(
  date: DateOnly,
  timeZone: string = DEFAULT_PARK_TIMEZONE,
): { start: Date; end: Date } {
  return {
    start: zonedTimeToInstant(date, '00:00', timeZone),
    end: zonedTimeToInstant(addDays(date, 1), '00:00', timeZone),
  };
}
