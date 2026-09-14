import type { PermissionKey } from '@/lib/access';

/**
 * Menu do painel, na ordem dos módulos. Cada item só aparece para quem tem a
 * permissão (ou uma delas, quando é uma lista) — e a própria página confere de
 * novo no servidor.
 */

export type AdminIcon =
  | 'overview'
  | 'orders'
  | 'tickets'
  | 'customers'
  | 'ticketTypes'
  | 'coupons'
  | 'calendar'
  | 'gate'
  | 'finance'
  | 'reports'
  | 'team'
  | 'permissions'
  | 'audit'
  | 'settings';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: AdminIcon;
  /** Uma permissão, ou qualquer uma da lista. */
  permission: PermissionKey | readonly PermissionKey[];
}

export interface AdminNavSection {
  /** Vazio: itens soltos no topo do menu. */
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: readonly AdminNavSection[] = [
  {
    label: '',
    items: [{ href: '/admin', label: 'Dashboard', icon: 'overview', permission: 'dashboard.view' }],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/admin/vendas', label: 'Vendas', icon: 'orders', permission: 'orders.view' },
      { href: '/admin/ingressos', label: 'Ingressos', icon: 'tickets', permission: 'tickets.view' },
      { href: '/admin/clientes', label: 'Clientes', icon: 'customers', permission: 'customers.view' },
      {
        href: '/admin/tipos-de-ingresso',
        label: 'Tipos de ingresso',
        icon: 'ticketTypes',
        permission: 'ticket_types.view',
      },
      { href: '/admin/cupons', label: 'Cupons', icon: 'coupons', permission: 'coupons.view' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/admin/calendario', label: 'Calendário', icon: 'calendar', permission: 'calendar.view' },
      {
        href: '/admin/portaria',
        label: 'Portaria / Check-in',
        icon: 'gate',
        permission: ['checkin.scan', 'checkin.manual', 'checkin.monitor'],
      },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/admin/financeiro', label: 'Financeiro', icon: 'finance', permission: 'finance.view' },
      { href: '/admin/relatorios', label: 'Relatórios', icon: 'reports', permission: 'reports.view' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/admin/equipe', label: 'Equipe', icon: 'team', permission: 'users.view' },
      { href: '/admin/permissoes', label: 'Permissões', icon: 'permissions', permission: 'users.view' },
      { href: '/admin/auditoria', label: 'Auditoria', icon: 'audit', permission: 'audit.view' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/admin/configuracoes', label: 'Configurações', icon: 'settings', permission: 'settings.view' },
    ],
  },
];

function permitido(item: AdminNavItem, permissions: ReadonlySet<PermissionKey>): boolean {
  const exigidas: readonly PermissionKey[] =
    typeof item.permission === 'string' ? [item.permission] : item.permission;
  return exigidas.some((permissao) => permissions.has(permissao));
}

export function navFor(permissions: ReadonlySet<PermissionKey>): AdminNavSection[] {
  return ADMIN_NAV.map((secao) => ({
    label: secao.label,
    items: secao.items.filter((item) => permitido(item, permissions)),
  })).filter((secao) => secao.items.length > 0);
}

/** Primeira tela que a pessoa pode abrir (a portaria cai direto na portaria). */
export function firstAllowedHref(permissions: ReadonlySet<PermissionKey>): string | null {
  for (const secao of ADMIN_NAV) {
    for (const item of secao.items) if (permitido(item, permissions)) return item.href;
  }
  return null;
}
