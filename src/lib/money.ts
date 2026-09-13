/**
 * Dinheiro no sistema é sempre inteiro em centavos: R$ 49,90 → 4990.
 *
 * Nenhuma conta de dinheiro usa ponto flutuante. Percentuais usam pontos-base
 * (1000 = 10%), para que descontos e taxas também fiquem em inteiros.
 */

export type Cents = number;

/** Maior valor aceito em um campo de dinheiro (limite do `integer` do Postgres). */
export const MAX_CENTS = 2_147_483_647;

/** 100% em pontos-base. */
export const FULL_BPS = 10_000;

/** Espaço inseparável: "R$" nunca fica sozinho no fim de uma linha. */
const NBSP = '\u00A0';

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertCents(value: number, label = 'valor'): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} deve ser um número inteiro de centavos (recebido: ${value})`);
  }
}

const agrupador = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0, useGrouping: 'always' });

/**
 * 125000 → "R$ 1.250,00" (com espaço inseparável depois de "R$").
 * A conta é feita em inteiros; o `Intl` só agrupa os milhares.
 */
export function formatBRL(cents: Cents): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const centavos = abs % 100;
  const reais = (abs - centavos) / 100;
  const sinal = cents < 0 ? '-' : '';
  return `${sinal}R$${NBSP}${agrupador.format(reais)},${centavos.toString().padStart(2, '0')}`;
}

/**
 * Lê um valor digitado em reais e devolve centavos, ou `null` se não for válido.
 *
 * Aceita "1.250,00", "1250,5", "R$ 49,90", "49.90" e "50". Com vírgula, os pontos
 * são separadores de milhar; sem vírgula, "1.250" é mil duzentos e cinquenta e
 * "49.90" é quarenta e nove e noventa.
 */
export function parseBRL(input: string): Cents | null {
  const limpo = input.replace(/R\$|\s/g, '');
  if (!limpo) return null;

  const negativo = limpo.startsWith('-');
  const valor = negativo ? limpo.slice(1) : limpo;

  let inteiro: string;
  let fracao = '';

  if (valor.includes(',')) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d{1,2}$/.test(valor)) return null;
    const [parteInteira = '', parteFracao = ''] = valor.replace(/\./g, '').split(',');
    inteiro = parteInteira;
    fracao = parteFracao;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(valor)) {
    inteiro = valor.replace(/\./g, '');
  } else if (/^\d+(\.\d{1,2})?$/.test(valor)) {
    const [parteInteira = '', parteFracao = ''] = valor.split('.');
    inteiro = parteInteira;
    fracao = parteFracao;
  } else {
    return null;
  }

  const cents = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negativo ? -cents : cents;
}

/**
 * Aplica pontos-base a um valor, arredondando o meio centavo para longe do zero.
 * 4990 com 1000 bps (10%) → 499; 4990 com 1500 bps (15%) → 749.
 */
export function applyBps(cents: Cents, bps: number): Cents {
  assertCents(cents);
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new RangeError(`pontos-base devem ser um inteiro não negativo (recebido: ${bps})`);
  }
  const produto = BigInt(Math.abs(cents)) * BigInt(bps);
  const arredondado = Number((produto + 5_000n) / 10_000n);
  return cents < 0 ? -arredondado : arredondado;
}

/** Soma valores em centavos conferindo que todos são inteiros. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) {
    assertCents(value);
    total += value;
  }
  assertCents(total, 'soma');
  return total;
}

/**
 * Divide um valor em partes proporcionais aos pesos sem perder nem sobrar
 * centavo (método do maior resto). Usado para distribuir desconto entre itens.
 *
 * allocateCents(100, [1, 1, 1]) → [34, 33, 33]
 */
export function allocateCents(total: Cents, weights: readonly number[]): Cents[] {
  assertCents(total, 'total');
  if (weights.length === 0) throw new RangeError('É preciso ao menos um peso');
  for (const peso of weights) {
    if (!Number.isSafeInteger(peso) || peso < 0) {
      throw new RangeError(`pesos devem ser inteiros não negativos (recebido: ${peso})`);
    }
  }

  const somaPesos = weights.reduce((acc, peso) => acc + peso, 0);
  const pesos = somaPesos === 0 ? weights.map(() => 1) : weights;
  const divisor = BigInt(somaPesos === 0 ? weights.length : somaPesos);
  const valor = BigInt(Math.abs(total));

  const partes = pesos.map((peso) => (valor * BigInt(peso)) / divisor);
  const restos = pesos
    .map((peso, indice) => ({ indice, resto: (valor * BigInt(peso)) % divisor }))
    .sort((a, b) => (a.resto === b.resto ? a.indice - b.indice : a.resto > b.resto ? -1 : 1));

  const distribuido = partes.reduce((acc, parte) => acc + parte, 0n);
  const sobra = Number(valor - distribuido);
  for (let i = 0; i < sobra; i++) {
    const alvo = restos[i];
    if (alvo) partes[alvo.indice] = (partes[alvo.indice] ?? 0n) + 1n;
  }

  return partes.map((parte) => (total < 0 ? -Number(parte) : Number(parte)));
}
