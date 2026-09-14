import { Download, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';

import { PeriodFilter } from '@/components/admin/period-filter';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { PageHeader } from '@/components/ui/page-header';
import { formatDateBR, todayIn } from '@/lib/dates';
import { parsePeriod, type ParsedPeriod } from '@/lib/periods';
import type { SearchParamsRecord } from '@/server/filters';

import { FinanceEntryDialog } from './finance-entries';

export type FinanceTab = 'geral' | 'ingressos' | 'lancamentos';

const ABAS: readonly { chave: FinanceTab; rotulo: string; href: string }[] = [
  { chave: 'geral', rotulo: 'Visão geral', href: '/admin/financeiro' },
  { chave: 'ingressos', rotulo: 'Ingressos', href: '/admin/financeiro/ingressos' },
  { chave: 'lancamentos', rotulo: 'Lançamentos', href: '/admin/financeiro/lancamentos' },
];

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Período das telas do financeiro: "Este mês" quando não vier nada. */
export function financePeriod(parametros: SearchParamsRecord, timezone: string): ParsedPeriod {
  return parsePeriod(
    { periodo: primeiro(parametros.periodo), de: primeiro(parametros.de), ate: primeiro(parametros.ate) },
    todayIn(timezone),
    'mes',
  );
}

export function periodQuery(periodo: ParsedPeriod): string {
  return periodo.key === 'personalizado'
    ? `periodo=personalizado&de=${periodo.range.from}&ate=${periodo.range.to}`
    : `periodo=${periodo.key}`;
}

export function periodLabel(periodo: ParsedPeriod): string {
  return periodo.range.from === periodo.range.to
    ? formatDateBR(periodo.range.from)
    : `${formatDateBR(periodo.range.from)} a ${formatDateBR(periodo.range.to)}`;
}

/** Título, abas (Visão geral, Ingressos, Lançamentos) e filtro de período do financeiro. */
export function FinanceHeader({
  tab,
  period,
  description,
  today,
  canManage,
  canExport = false,
}: {
  tab: FinanceTab;
  period: ParsedPeriod;
  description: string;
  today: string;
  canManage: boolean;
  canExport?: boolean;
}) {
  const consulta = periodQuery(period);
  const atual = ABAS.find((item) => item.chave === tab) ?? ABAS[0];

  return (
    <>
      <PageHeader
        title="Financeiro"
        description={description}
        actions={
          <>
            {canExport ? (
              <>
                <a
                  href={`/api/admin/reports/faturamento/export?formato=xlsx&${consulta}`}
                  className={buttonClasses('secondary')}
                >
                  <FileSpreadsheet className="size-4" aria-hidden />
                  Excel
                </a>
                <a
                  href={`/api/admin/reports/faturamento/export?formato=csv&${consulta}`}
                  className={buttonClasses('secondary')}
                >
                  <Download className="size-4" aria-hidden />
                  CSV
                </a>
              </>
            ) : null}
            {canManage ? <FinanceEntryDialog today={today} /> : null}
          </>
        }
      />
      <div className="grid gap-4">
        <nav aria-label="Seções do financeiro" className="flex gap-1 overflow-x-auto border-b border-ink-200">
          {ABAS.map((item) => (
            <Link
              key={item.chave}
              href={`${item.href}?${consulta}`}
              aria-current={item.chave === tab ? 'page' : undefined}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm font-semibold transition-colors',
                item.chave === tab
                  ? 'border-pool-700 text-ink-900'
                  : 'border-transparent text-ink-500 hover:text-ink-800',
              )}
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
        <PeriodFilter basePath={atual?.href ?? '/admin/financeiro'} period={period} />
      </div>
    </>
  );
}
