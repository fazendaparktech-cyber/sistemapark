/**
 * Catálogo de permissões e perfis padrão.
 *
 * É a fonte da verdade: o banco é sincronizado a partir daqui a cada deploy
 * (`npm run access:sync`). O painel usa o mesmo catálogo para rótulos e para
 * esconder botões — mas quem barra de verdade é o servidor (`src/server/access`).
 * Os grupos seguem os módulos do menu.
 */

export const PERMISSION_GROUPS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: [
      { key: 'dashboard.view', label: 'Ver o dashboard' },
      { key: 'dashboard.financial', label: 'Ver valores de faturamento no dashboard' },
    ],
  },
  {
    key: 'sales',
    label: 'Vendas',
    permissions: [
      { key: 'orders.view', label: 'Ver vendas e pedidos' },
      { key: 'pos.sell', label: 'Fazer venda presencial' },
      { key: 'pos.discount', label: 'Dar desconto manual na venda presencial' },
      { key: 'orders.cancel', label: 'Cancelar vendas' },
      { key: 'orders.resend', label: 'Reenviar ingressos por e-mail e WhatsApp' },
    ],
  },
  {
    key: 'tickets',
    label: 'Ingressos',
    permissions: [
      { key: 'tickets.view', label: 'Ver e buscar ingressos' },
      { key: 'tickets.manage', label: 'Gerar novo link dos ingressos de um pedido' },
    ],
  },
  {
    key: 'customers',
    label: 'Clientes',
    permissions: [
      { key: 'customers.view', label: 'Ver clientes' },
      { key: 'customers.manage', label: 'Cadastrar e editar clientes' },
      { key: 'customers.export', label: 'Exportar dados de clientes' },
    ],
  },
  {
    key: 'catalog',
    label: 'Tipos de ingresso e cupons',
    permissions: [
      { key: 'ticket_types.view', label: 'Ver tipos de ingresso e preços' },
      { key: 'ticket_types.manage', label: 'Criar e editar tipos de ingresso e preços' },
      { key: 'coupons.view', label: 'Ver cupons' },
      { key: 'coupons.manage', label: 'Criar e editar cupons' },
    ],
  },
  {
    key: 'operation',
    label: 'Operação',
    permissions: [
      { key: 'calendar.view', label: 'Ver o calendário e a capacidade' },
      { key: 'calendar.manage', label: 'Abrir e fechar dias, horários, capacidade e preços especiais' },
      { key: 'checkin.scan', label: 'Escanear QR Code e liberar entrada' },
      { key: 'checkin.manual', label: 'Buscar ingresso e liberar entrada manualmente' },
      { key: 'checkin.monitor', label: 'Ver as entradas do dia e o histórico da portaria' },
    ],
  },
  {
    key: 'finance',
    label: 'Financeiro',
    permissions: [
      { key: 'finance.view', label: 'Ver o financeiro e consultar pagamentos' },
      { key: 'refunds.approve', label: 'Fazer reembolsos' },
      { key: 'reports.view', label: 'Ver relatórios' },
      { key: 'reports.export', label: 'Exportar relatórios e planilhas' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    permissions: [
      { key: 'marketing.view', label: 'Ver origem das vendas e funil de compra' },
      { key: 'marketing.manage', label: 'Configurar pixels e rastreamento' },
    ],
  },
  {
    key: 'admin',
    label: 'Gestão e sistema',
    permissions: [
      { key: 'users.view', label: 'Ver usuários' },
      { key: 'users.manage', label: 'Cadastrar, editar e desativar usuários' },
      { key: 'roles.manage', label: 'Alterar as permissões dos perfis' },
      { key: 'audit.view', label: 'Ver o registro de atividades' },
      { key: 'settings.view', label: 'Ver as configurações' },
      { key: 'settings.manage', label: 'Alterar os dados, o funcionamento e as políticas do parque' },
      { key: 'integrations.manage', label: 'Alterar pagamentos e comunicação' },
    ],
  },
] as const;

export type PermissionGroupKey = (typeof PERMISSION_GROUPS)[number]['key'];
export type PermissionKey = (typeof PERMISSION_GROUPS)[number]['permissions'][number]['key'];

export const ALL_PERMISSIONS: readonly PermissionKey[] = (() => {
  const keys: PermissionKey[] = [];
  for (const grupo of PERMISSION_GROUPS) for (const permissao of grupo.permissions) keys.push(permissao.key);
  return keys;
})();

export const PERMISSION_LABELS: Readonly<Record<PermissionKey, string>> = (() => {
  const labels = {} as Record<PermissionKey, string>;
  for (const grupo of PERMISSION_GROUPS)
    for (const permissao of grupo.permissions) labels[permissao.key] = permissao.label;
  return labels;
})();

/** Grupo (módulo) de cada permissão, gravado em `permissions.module`. */
export const PERMISSION_MODULE: Readonly<Record<PermissionKey, PermissionGroupKey>> = (() => {
  const modules = {} as Record<PermissionKey, PermissionGroupKey>;
  for (const grupo of PERMISSION_GROUPS)
    for (const permissao of grupo.permissions) modules[permissao.key] = grupo.key;
  return modules;
})();

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export const ROLE_KEYS = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'BOX_OFFICE', 'GATE', 'MARKETING'] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  /** `ALL` acompanha o catálogo: permissão nova entra automaticamente. */
  permissions: 'ALL' | readonly PermissionKey[];
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    key: 'SUPER_ADMIN',
    name: 'Super admin',
    description: 'Dono do sistema: acesso total, inclusive para nomear outros super admins. Não pode ser editado.',
    permissions: 'ALL',
  },
  {
    key: 'ADMIN',
    name: 'Administrador',
    description: 'Acesso completo: vendas, operação, financeiro, marketing, usuários e configurações.',
    permissions: 'ALL',
  },
  {
    key: 'MANAGER',
    name: 'Gerente',
    description: 'Opera o parque no dia a dia: vendas, ingressos, clientes, calendário, portaria e relatórios.',
    permissions: [
      'dashboard.view',
      'dashboard.financial',
      'orders.view',
      'pos.sell',
      'pos.discount',
      'orders.cancel',
      'orders.resend',
      'tickets.view',
      'tickets.manage',
      'customers.view',
      'customers.manage',
      'ticket_types.view',
      'ticket_types.manage',
      'coupons.view',
      'coupons.manage',
      'calendar.view',
      'calendar.manage',
      'checkin.scan',
      'checkin.manual',
      'checkin.monitor',
      'finance.view',
      'reports.view',
      'reports.export',
      'marketing.view',
      'users.view',
      'audit.view',
      'settings.view',
    ],
  },
  {
    key: 'FINANCE',
    name: 'Financeiro',
    description: 'Vendas, financeiro, reembolsos e relatórios.',
    permissions: [
      'dashboard.view',
      'dashboard.financial',
      'orders.view',
      'tickets.view',
      'customers.view',
      'coupons.view',
      'finance.view',
      'refunds.approve',
      'reports.view',
      'reports.export',
      'audit.view',
    ],
  },
  {
    key: 'BOX_OFFICE',
    name: 'Bilheteria',
    description: 'Faz vendas no balcão, consulta clientes e ingressos.',
    permissions: [
      'orders.view',
      'pos.sell',
      'orders.resend',
      'tickets.view',
      'customers.view',
      'customers.manage',
      'ticket_types.view',
      'calendar.view',
    ],
  },
  {
    key: 'GATE',
    name: 'Portaria',
    description: 'Escaneia ingressos, busca ingresso e libera a entrada.',
    permissions: ['checkin.scan', 'checkin.manual', 'checkin.monitor'],
  },
  {
    key: 'MARKETING',
    name: 'Marketing',
    description: 'Métricas, cupons, origem das vendas e pixels.',
    permissions: [
      'dashboard.view',
      'coupons.view',
      'coupons.manage',
      'marketing.view',
      'marketing.manage',
      'reports.view',
    ],
  },
];

export function roleDefinition(key: RoleKey): RoleDefinition {
  const definicao = ROLE_DEFINITIONS.find((papel) => papel.key === key);
  if (!definicao) throw new RangeError(`Papel desconhecido: ${key}`);
  return definicao;
}

/** Permissões padrão de um papel, já expandindo `ALL`. */
export function defaultPermissionsFor(key: RoleKey): readonly PermissionKey[] {
  const { permissions } = roleDefinition(key);
  return permissions === 'ALL' ? ALL_PERMISSIONS : permissions;
}

/** Papel que ninguém edita e que só outro super admin atribui. */
export const SUPER_ADMIN_ROLE: RoleKey = 'SUPER_ADMIN';
