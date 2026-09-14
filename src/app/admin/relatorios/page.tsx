import { ChevronRight, FileSpreadsheet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { NoPermission } from '@/components/admin/no-permission';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { canSeeReport, REPORT_KEYS, REPORTS } from '@/lib/reports';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Relatórios' };

export default async function RelatoriosPage() {
  const auth = await requirePageAuth();
  if (!can(auth, 'reports.view')) return <NoPermission />;
  const disponiveis = REPORT_KEYS.filter((chave) => canSeeReport(auth.permissions, chave));
  const exporta = can(auth, 'reports.export');

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Relatórios"
        description={
          exporta
            ? 'Escolha o relatório e o período. Todos podem ser baixados em CSV ou Excel.'
            : 'Escolha o relatório e o período para consultar.'
        }
      />
      {disponiveis.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title="Nenhum relatório liberado"
            description="Seu perfil não tem acesso aos dados de nenhum relatório."
          />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {disponiveis.map((chave) => (
            <li key={chave}>
              <Link
                href={`/admin/relatorios/${chave}`}
                className="flex h-full items-start gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 transition-colors hover:bg-pool-50/40 hover:ring-pool-200"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-pool-50 text-pool-700 ring-1 ring-pool-100">
                  <FileSpreadsheet className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] font-semibold text-ink-900">
                    {REPORTS[chave].title}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-ink-600">
                    {REPORTS[chave].description}
                  </span>
                  <span className="mt-2 block text-xs font-medium text-ink-500">
                    Período pela {REPORTS[chave].basis.toLowerCase()}
                  </span>
                </span>
                <ChevronRight className="mt-2 size-5 shrink-0 text-ink-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
