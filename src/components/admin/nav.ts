import type { PermissionKey } from '@/lib/access';

/**
 * Menu do painel. Cada item só aparece para quem tem a permissão — e a própria
 * página confere de novo no servidor.
 */

export type AdminIcon =
  | 'overview'
  | 'orders'
  | 'customers'
  | 'coupons'
  | 'tickets'
  | 'calendar'
  | 'team'
  | 'permissions'
  | 'audit'
  | 'settings';

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
    items: [{ href: '/admin', label: 'Painel', icon: 'overview', permission: null }],
  },
  {
    label: 'Vendas',
    items: [
      { href: '/admin/pedidos', label: 'Pedidos', icon: 'orders', permission: 'orders.view' },
      { href: '/admin/clientes', label: 'Clientes', icon: 'customers', permission: 'customers.view' },
      { href: '/admin/cupons', label: 'Cupons', icon: 'coupons', permission: 'coupons.view' },
    ],
  },
  {
    label: 'Parque',
    items: [
      {
        href: '/admin/ingressos',
        label: 'Ingressos e preços',
        icon: 'tickets',
        permission: 'ticket_types.view',
      },
      { href: '/admin/calendario', label: 'Calendário', icon: 'calendar', permission: 'calendar.view' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { href: '/admin/equipe', label: 'Equipe', icon: 'team', permission: 'users.view' },
      { href: '/admin/permissoes', label: 'Permissões', icon: 'permissions', permission: 'users.view' },
      { href: '/admin/auditoria', label: 'Auditoria', icon: 'audit', permission: 'audit.view' },
      { href: '/admin/configuracoes', label: 'Configurações', icon: 'settings', permission: 'settings.view' },
    ],
  },
];

export function navFor(permissions: ReadonlySet<PermissionKey>): AdminNavSection[] {
  return ADMIN_NAV.map((secao) => ({
    label: secao.label,
    items: secao.items.filter((item) => item.permission === null || permissions.has(item.permission)),
  })).filter((secao) => secao.items.length > 0);
}
