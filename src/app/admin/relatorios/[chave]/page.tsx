import { ArrowLeft, Download, FileSpreadsheet, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { NoPermission } from '@/components/admin/no-permission';
import { PeriodFilter } from '@/components/admin/period-filter';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, todayIn } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { parsePeriod, type ParsedPeriod } from '@/lib/periods';
import { canSeeReport, formatReportValue, isReportKey, REPORTS } from '@/lib/reports';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import type { SearchParamsRecord } from '@/server/filters';
import { REPORT_PREVIEW_ROWS, runReport } from '@/server/reports/service';

export const metadata: Metadata = { title: 'Relatório' };

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function consultaDoPeriodo(periodo: ParsedPeriod): string {
  return periodo.key === 'personalizado'
    ? `periodo=personalizado&de=${periodo.range.from}&ate=${periodo.range.to}`
    : `periodo=${periodo.key}`;
}

const NUMERICOS = new Set(['integer', 'money', 'percent']);

export default async function RelatorioPage({
  params,
  searchParams,
}: {
  params: Promise<{ chave: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const auth = await requirePageAuth();
  const { chave } = await params;
  if (!isReportKey(chave)) notFound();
  if (!canSeeReport(auth.permissions, chave)) return <NoPermission />;

  const parametros = await searchParams;
  const periodo = parsePeriod(
    { periodo: primeiro(parametros.periodo), de: primeiro(parametros.de), ate: primeiro(parametros.ate) },
    todayIn(auth.park.timezone),
    'mes',
  );
  const relatorio = await runReport(auth, chave, periodo);
  const info = REPORTS[chave];
  const fuso = auth.park.timezone;
  const consulta = consultaDoPeriodo(periodo);
  const linhas = relatorio.rows.slice(0, REPORT_PREVIEW_ROWS);
  const intervalo =
    periodo.range.from === periodo.range.to
      ? formatDateBR(periodo.range.from)
      : `${formatDateBR(periodo.range.from)} a ${formatDateBR(periodo.range.to)}`;

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/relatorios"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Relatórios
      </Link>
      <PageHeader
        title={info.title}
        description={`${info.description} Período pela ${info.basis.toLowerCase()}: ${intervalo}.`}
        actions={
          can(auth, 'reports.export') ? (
            <>
              <a
                href={`/api/admin/reports/${chave}/export?formato=xlsx&${consulta}`}
                className={buttonClasses('secondary')}
              >
                <FileSpreadsheet className="size-4" aria-hidden />
                Excel
              </a>
              <a
                href={`/api/admin/reports/${chave}/export?formato=csv&${consulta}`}
                className={buttonClasses('secondary')}
              >
                <Download className="size-4" aria-hidden />
                CSV
              </a>
            </>
          ) : null
        }
      />
      <PeriodFilter basePath={`/admin/relatorios/${chave}`} period={periodo} />

      {relatorio.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="Nada no período"
            description="Nenhum registro para este relatório no período escolhido. Tente um período maior."
          />
        </Card>
      ) : (
        <>
          <p className="text-sm text-ink-600">
            {formatNumber(relatorio.rows.length)} {relatorio.rows.length === 1 ? 'linha' : 'linhas'}
            {relatorio.rows.length > linhas.length
              ? `. Mostrando as primeiras ${formatNumber(linhas.length)}; a planilha traz todas.`
              : ''}
            {relatorio.truncated ? ' O limite de linhas foi atingido: use um período menor.' : ''}
          </p>
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  {relatorio.columns.map((coluna) => (
                    <TH
                      key={coluna.key}
                      className={cn('whitespace-nowrap', NUMERICOS.has(coluna.type) && 'text-right')}
                    >
                      {coluna.label}
                    </TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {linhas.map((linha, indice) => (
                  <TR key={indice}>
                    {relatorio.columns.map((coluna) => (
                      <TD
                        key={coluna.key}
                        className={cn(
                          'whitespace-nowrap',
                          NUMERICOS.has(coluna.type) && 'tabular text-right',
                          indice === 0 && coluna === relatorio.columns[0] && 'font-medium text-ink-900',
                        )}
                      >
                        {formatReportValue(linha[coluna.key] ?? null, coluna.type, fuso)}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
              {relatorio.totals ? (
                <tfoot className="border-t border-ink-200 bg-ink-50/60 text-sm font-semibold text-ink-900">
                  <tr>
                    {relatorio.columns.map((coluna) => (
                      <td
                        key={coluna.key}
                        className={cn(
                          'whitespace-nowrap px-4 py-3',
                          NUMERICOS.has(coluna.type) && 'tabular text-right',
                        )}
                      >
                        {formatReportValue(relatorio.totals?.[coluna.key] ?? null, coluna.type, fuso)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </Table>
          </TableContainer>
        </>
      )}
    </div>
  );
}
