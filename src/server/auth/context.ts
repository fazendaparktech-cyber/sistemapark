import type { PermissionKey, RoleKey } from '@/lib/access';

import { Errors } from '../errors';

/** Quem está usando o sistema nesta requisição, e o que pode fazer no parque atual. */
export interface AuthContext {
  sessionId: string;
  user: {
    id: string;
    name: string;
    email: string;
    mustChangePassword: boolean;
  };
  park: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  roles: readonly RoleKey[];
  permissions: ReadonlySet<PermissionKey>;
  isSuperAdmin: boolean;
}

export function can(auth: AuthContext, permission: PermissionKey): boolean {
  return auth.permissions.has(permission);
}

/** Barra a ação com 403 se faltar qualquer uma das permissões. */
export function requirePermission(auth: AuthContext, ...permissions: PermissionKey[]): void {
  for (const permissao of permissions) {
    if (!auth.permissions.has(permissao)) throw Errors.forbidden(permissao);
  }
}
