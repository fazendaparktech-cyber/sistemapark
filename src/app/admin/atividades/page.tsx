import type { Metadata } from 'next';

import { ActivityLog } from '@/components/admin/audit/activity-log';
import { NoPermission } from '@/components/admin/no-permission';
import { PageHeader } from '@/components/ui/page-header';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import type { SearchParamsRecord } from '@/server/filters';

export const metadata: Metadata = { title: 'Atividades' };

export default async function AtividadesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const auth = await requirePageAuth();
  if (!can(auth, 'audit.view')) return <NoPermission />;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Atividades"
        description="Tudo o que foi feito no sistema: o quê, quando e de onde. Os registros não podem ser alterados nem apagados."
      />
      <ActivityLog auth={auth} parametros={await searchParams} />
    </div>
  );
}
