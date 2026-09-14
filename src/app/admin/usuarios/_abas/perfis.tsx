import { PermissionMatrix } from '@/components/admin/permissions/permission-matrix';
import { listRoles } from '@/server/access/service';
import { can, type AuthContext } from '@/server/auth/context';

/** Aba Perfis e permissões: o que cada perfil pode ver e fazer. */
export async function AbaPerfis({ auth }: { auth: AuthContext }) {
  const papeis = await listRoles(auth);
  // Quando os dados mudam no servidor, a matriz é recriada com o estado novo.
  const versao = papeis.map((papel) => `${papel.key}:${papel.permissions.length}:${papel.members}`).join('|');

  return (
    <PermissionMatrix
      key={versao}
      roles={papeis}
      canEdit={can(auth, 'roles.manage')}
      grantable={[...auth.permissions]}
    />
  );
}
