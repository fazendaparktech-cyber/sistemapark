import type { PermissionKey } from '@/lib/access';

/**
 * Menu do painel. Cada item só aparece para quem tem a permissão — e a própria
 * página confere de novo no servidor. Módulos novos entram aqui quando ficam
 * prontos, nunca antes.
 */

export type AdminIcon = 'overview' | 'team' | 'permissions' | 'audit';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: AdminIcon;
  permission: PermissionKey | null;
}

export interface AdminNavSection {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: readonly AdminNavSection[] = [
  {
    label: 'Geral',
    items: [{ href: '/admin', label: 'Visão geral', icon: 'overview', permission: null }],
  },
  {
    label: 'Administração',
    items: [
      { href: '/admin/equipe', label: 'Equipe', icon: 'team', permission: 'users.view' },
      { href: '/admin/permissoes', label: 'Permissões', icon: 'permissions', permission: 'users.view' },
      { href: '/admin/auditoria', label: 'Auditoria', icon: 'audit', permission: 'audit.view' },
    ],
  },
];

export function navFor(permissions: ReadonlySet<PermissionKey>): AdminNavSection[] {
  return ADMIN_NAV.map((secao) => ({
    label: secao.label,
    items: secao.items.filter((item) => item.permission === null || permissions.has(item.permission)),
  })).filter((secao) => secao.items.length > 0);
}
