import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { buildXlsx } from '@/server/xlsx';

describe('planilha Excel', () => {
  it('gera um arquivo xlsx com cabeçalho, números e totais', () => {
    const arquivo = buildXlsx({
      name: 'Vendas: setembro/2026',
      columns: [
        { label: 'Pedido', type: 'text' },
        { label: 'Ingressos', type: 'integer' },
        { label: 'Total', type: 'money' },
        { label: 'Participação', type: 'percent' },
      ],
      rows: [
        ['CP-2026-000001 <&>', 2, 14050, 0.25],
        ['=SOMA(A1)', null, 0, null],
      ],
      totals: ['Total', 2, 14050, 1],
    });

    expect(strFromU8(arquivo.slice(0, 2))).toBe('PK');
    const partes = unzipSync(arquivo);
    expect(Object.keys(partes).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);

    const livro = strFromU8(partes['xl/workbook.xml'] ?? new Uint8Array());
    expect(livro).toContain('name="Vendas  setembro 2026"');

    const aba = strFromU8(partes['xl/worksheets/sheet1.xml'] ?? new Uint8Array());
    expect(aba).toContain('<t xml:space="preserve">Pedido</t>');
    expect(aba).toContain('CP-2026-000001 &lt;&amp;&gt;');
    expect(aba).toContain('<c r="C2" s="3"><v>140.5</v></c>');
    expect(aba).toContain('<c r="D2" s="4"><v>0.25</v></c>');
    // Texto que parece fórmula fica como texto (inlineStr), nunca como fórmula.
    expect(aba).toContain('t="inlineStr"><is><t xml:space="preserve">=SOMA(A1)</t>');
    expect(aba).not.toContain('<f>');
    expect(aba).toContain('<row r="4">');
  });
});
