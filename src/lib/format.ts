/** Números para exibição, em português, sem depender do idioma do aparelho. */

const inteiro = new Intl.NumberFormat('pt-BR');
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const reaisCompacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatNumber(valor: number): string {
  return inteiro.format(valor);
}

/** 0,125 → "12,5%". */
export function formatPercent(fracao: number): string {
  return percentual.format(fracao);
}

/** Eixo de gráfico: 125000 centavos → "R$ 1,3 mil". Só para exibição. */
export function formatCompactBRL(cents: number): string {
  return reaisCompacto.format(cents / 100);
}

/** Variação para os indicadores: "+12,5%", "-3%", "0%". */
export function formatChange(fracao: number): string {
  const texto = percentual.format(Math.abs(fracao));
  if (fracao > 0) return `+${texto}`;
  if (fracao < 0) return `-${texto}`;
  return texto;
}

/** Diferença entre duas taxas em pontos percentuais: 0,032 → "+3,2 p.p.". */
export function formatPoints(diferenca: number): string {
  const pontos = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(
    Math.abs(diferenca * 100),
  );
  const sinal = diferenca > 0 ? '+' : diferenca < 0 ? '-' : '';
  return `${sinal}${pontos} p.p.`;
}

/** "1 ingresso" / "3 ingressos". */
export function plural(quantidade: number, singular: string, pluralForma: string): string {
  return `${formatNumber(quantidade)} ${quantidade === 1 ? singular : pluralForma}`;
}
