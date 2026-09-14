import 'server-only';

import { strToU8, zipSync } from 'fflate';

/**
 * Planilha Excel (.xlsx) de uma aba, sem dependência pesada: o arquivo é um
 * ZIP com os XMLs mínimos do formato. Números saem como números (dá para somar
 * no Excel), valores em reais com duas casas e percentuais como percentuais.
 */

export type XlsxColumnType = 'text' | 'integer' | 'money' | 'percent';
export type XlsxCell = string | number | null;

export interface XlsxSheet {
  name: string;
  columns: { label: string; type: XlsxColumnType; width?: number }[];
  rows: XlsxCell[][];
  /** Linha de totais em negrito, no fim. */
  totals?: XlsxCell[] | null;
}

const ESTILO_NORMAL: Record<XlsxColumnType, number> = { text: 0, integer: 2, money: 3, percent: 4 };
const ESTILO_NEGRITO: Record<XlsxColumnType, number> = { text: 1, integer: 5, money: 6, percent: 7 };

function xml(texto: string): string {
  // Remove caracteres de controle que o XML não aceita (fica tab, quebra de linha e retorno).
  const limpo = [...texto]
    .filter((caractere) => {
      const codigo = caractere.charCodeAt(0);
      return codigo === 9 || codigo === 10 || codigo === 13 || codigo >= 32;
    })
    .join('');
  return limpo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function coluna(indice: number): string {
  let n = indice + 1;
  let letras = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

function celula(valor: XlsxCell, referencia: string, estilo: number): string {
  if (valor === null || valor === '') return '';
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return `<c r="${referencia}" s="${estilo}"><v>${valor}</v></c>`;
  }
  return `<c r="${referencia}" s="${estilo === 1 || estilo >= 5 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(String(valor))}</t></is></c>`;
}

function nomeDaAba(nome: string): string {
  const limpo = nome.replace(/[[\]:*?/\\]/g, ' ').trim();
  return (limpo || 'Planilha').slice(0, 31);
}

function planilha(folha: XlsxSheet): string {
  const linhas: string[] = [];
  const cabecalho = folha.columns.map((col, indice) => celula(col.label, `${coluna(indice)}1`, 1)).join('');
  linhas.push(`<row r="1">${cabecalho}</row>`);

  const adicionar = (valores: XlsxCell[], negrito: boolean) => {
    const numero = linhas.length + 1;
    const conteudo = folha.columns
      .map((col, indice) => {
        const bruto = valores[indice] ?? null;
        const valor = col.type === 'money' && typeof bruto === 'number' ? Math.round(bruto) / 100 : bruto;
        const estilo = (negrito ? ESTILO_NEGRITO : ESTILO_NORMAL)[col.type];
        return celula(valor, `${coluna(indice)}${numero}`, estilo);
      })
      .join('');
    linhas.push(`<row r="${numero}">${conteudo}</row>`);
  };
  for (const valores of folha.rows) adicionar(valores, false);
  if (folha.totals) adicionar(folha.totals, true);

  const larguras = folha.columns
    .map((col, indice) => {
      const largura = col.width ?? Math.min(48, Math.max(10, col.label.length + 4));
      return `<col min="${indice + 1}" max="${indice + 1}" width="${largura}" customWidth="1"/>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${larguras}</cols>` +
    `<sheetData>${linhas.join('')}</sheetData>` +
    '</worksheet>'
  );
}

const ESTILOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="8">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

export function buildXlsx(folha: XlsxSheet): Uint8Array {
  const tipos =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';
  const relacoes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const livro =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xml(nomeDaAba(folha.name))}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';
  const relacoesDoLivro =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  return zipSync(
    {
      '[Content_Types].xml': strToU8(tipos),
      '_rels/.rels': strToU8(relacoes),
      'xl/workbook.xml': strToU8(livro),
      'xl/_rels/workbook.xml.rels': strToU8(relacoesDoLivro),
      'xl/styles.xml': strToU8(ESTILOS),
      'xl/worksheets/sheet1.xml': strToU8(planilha(folha)),
    },
    { level: 6 },
  );
}
