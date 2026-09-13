import type { Metadata } from 'next';

import { NoPermission } from '@/components/admin/no-permission';
import { PermissionMatrix } from '@/components/admin/permissions/permission-matrix';
import { PageHeader } from '@/components/ui/page-header';
import { listRoles } from '@/server/access/service';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Permissões' };

export default async function PermissoesPage() {
  const auth = await requirePageAuth();
  if (!can(auth, 'users.view')) return <NoPermission />;

  const papeis = await listRoles(auth);
  // Quando os dados mudam no servidor, a matriz é recriada com o estado novo.
  const versao = papeis.map((papel) => `${papel.key}:${papel.permissions.length}:${papel.members}`).join('|');

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Permissões"
        description="O que cada papel pode ver e fazer. O sistema confere estas regras no servidor em toda ação."
      />
      <PermissionMatrix
        key={versao}
        roles={papeis}
        canEdit={can(auth, 'roles.manage')}
        grantable={[...auth.permissions]}
      />
    </div>
  );
}
