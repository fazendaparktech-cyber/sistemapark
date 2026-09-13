import 'server-only';

/**
 * CSV que abre certo no Excel em português: separador ";", BOM UTF-8 e
 * proteção contra injeção de fórmula (célula de texto começando com = + - @).
 */

type Celula = string | number | boolean | null | undefined;

function celula(valor: Celula): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  let texto = String(valor);
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  if (/[";\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function toCsv(cabecalho: readonly string[], linhas: readonly (readonly Celula[])[]): string {
  return `\uFEFF${[cabecalho, ...linhas].map((linha) => linha.map(celula).join(';')).join('\r\n')}\r\n`;
}

/** 125050 → "1250,50" (número que o Excel em português reconhece). */
export function centsToCsv(cents: number): string {
  const sinal = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sinal}${Math.floor(abs / 100)},${(abs % 100).toString().padStart(2, '0')}`;
}

export function csvResponse(nomeDoArquivo: string, conteudo: string): Response {
  return new Response(conteudo, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${nomeDoArquivo.replace(/[^A-Za-z0-9._-]/g, '-')}"`,
      'cache-control': 'no-store',
    },
  });
}
