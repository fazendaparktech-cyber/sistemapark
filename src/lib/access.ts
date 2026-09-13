/**
 * Catálogo de permissões e papéis padrão.
 *
 * É a fonte da verdade: o banco é sincronizado a partir daqui a cada deploy
 * (`npm run access:sync`). O painel usa o mesmo catálogo para rótulos e para
 * esconder botões — mas quem barra de verdade é o servidor (`src/server/access`).
 */

export const PERMISSION_GROUPS = [
  {
    key: 'dashboard',
    label: 'Painel',
    permissions: [
      { key: 'dashboard.view', label: 'Ver a visão geral' },
      { key: 'dashboard.financial', label: 'Ver números financeiros no painel' },
    ],
  },
  {
    key: 'catalog',
    label: 'Calendário e ingressos',
    permissions: [
      { key: 'calendar.view', label: 'Ver o calendário' },
      { key: 'calendar.manage', label: 'Abrir, fechar e bloquear datas e ajustar a lotação' },
      { key: 'ticket_types.view', label: 'Ver tipos de ingresso' },
      { key: 'ticket_types.manage', label: 'Criar e editar tipos de ingresso' },
      { key: 'prices.manage', label: 'Alterar preços e regras de preço' },
    ],
  },
  {
    key: 'sales',
    label: 'Vendas',
    permissions: [
      { key: 'orders.view', label: 'Ver pedidos' },
      { key: 'orders.cancel', label: 'Cancelar pedidos' },
      { key: 'orders.export', label: 'Exportar pedidos' },
      { key: 'tickets.view', label: 'Ver ingressos' },
      { key: 'tickets.resend', label: 'Reenviar ingressos' },
      { key: 'tickets.manage', label: 'Trocar titular e reemitir ingressos' },
      { key: 'customers.view', label: 'Ver clientes' },
      { key: 'customers.manage', label: 'Cadastrar e editar clientes' },
      { key: 'customers.export', label: 'Exportar dados de clientes' },
      { key: 'coupons.view', label: 'Ver cupons' },
      { key: 'coupons.manage', label: 'Criar e editar cupons' },
      { key: 'courtesies.create', label: 'Emitir cortesias' },
    ],
  },
  {
    key: 'finance',
    label: 'Financeiro',
    permissions: [
      { key: 'payments.view', label: 'Ver pagamentos' },
      { key: 'payments.reconcile', label: 'Conciliar pagamentos com o provedor' },
      { key: 'refunds.request', label: 'Solicitar reembolsos' },
      { key: 'refunds.approve', label: 'Aprovar reembolsos' },
      { key: 'finance.view', label: 'Ver o financeiro' },
      { key: 'finance.export', label: 'Exportar relatórios financeiros' },
    ],
  },
  {
    key: 'pos',
    label: 'Bilheteria e caixa',
    permissions: [
      { key: 'pos.sell', label: 'Vender na bilheteria' },
      { key: 'pos.discount', label: 'Dar desconto manual na bilheteria' },
      { key: 'cash.operate', label: 'Abrir, movimentar e fechar o próprio caixa' },
      { key: 'cash.view_all', label: 'Ver todos os caixas' },
    ],
  },
  {
    key: 'gate',
    label: 'Portaria',
    permissions: [
      { key: 'checkin.scan', label: 'Ler QR Code na portaria' },
      { key: 'checkin.manual', label: 'Buscar ingresso e liberar entrada manualmente' },
      { key: 'checkin.monitor', label: 'Acompanhar as entradas em tempo real' },
      { key: 'gates.manage', label: 'Gerenciar portões e dispositivos' },
    ],
  },
  {
    key: 'reports',
    label: 'Relatórios e marketing',
    permissions: [
      { key: 'reports.view', label: 'Ver relatórios' },
      { key: 'reports.export', label: 'Exportar relatórios' },
      { key: 'marketing.view', label: 'Ver o funil de vendas e a origem das vendas' },
    ],
  },
  {
    key: 'communications',
    label: 'Comunicação',
    permissions: [
      { key: 'communications.view', label: 'Ver o histórico de mensagens' },
      { key: 'communications.send', label: 'Enviar mensagens a clientes' },
    ],
  },
  {
    key: 'admin',
    label: 'Administração',
    permissions: [
      { key: 'users.view', label: 'Ver a equipe' },
      { key: 'users.manage', label: 'Cadastrar, editar e desativar pessoas da equipe' },
      { key: 'roles.manage', label: 'Alterar as permissões dos papéis' },
      { key: 'settings.view', label: 'Ver as configurações' },
      { key: 'settings.manage', label: 'Alterar as configurações do parque' },
      { key: 'integrations.manage', label: 'Alterar integrações (pagamento, WhatsApp, e-mail)' },
      { key: 'audit.view', label: 'Ver a auditoria' },
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

export const ROLE_KEYS = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'FINANCE',
  'BOX_OFFICE',
  'GATE',
  'SUPPORT',
  'MARKETING',
  'READ_ONLY',
] as const;

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
    description: 'Acesso total, inclusive para nomear outros super admins. Não pode ser editado.',
    permissions: 'ALL',
  },
  {
    key: 'ADMIN',
    name: 'Administrador',
    description: 'Administra o parque inteiro: equipe, permissões, configurações e finanças.',
    permissions: 'ALL',
  },
  {
    key: 'MANAGER',
    name: 'Gerente',
    description: 'Opera o parque: calendário, preços, vendas, bilheteria, portaria e relatórios.',
    permissions: [
      'dashboard.view',
      'dashboard.financial',
      'calendar.view',
      'calendar.manage',
      'ticket_types.view',
      'ticket_types.manage',
      'prices.manage',
      'orders.view',
      'orders.cancel',
      'orders.export',
      'tickets.view',
      'tickets.resend',
      'tickets.manage',
      'customers.view',
      'customers.manage',
      'coupons.view',
      'coupons.manage',
      'courtesies.create',
      'payments.view',
      'refunds.request',
      'finance.view',
      'pos.sell',
      'pos.discount',
      'cash.operate',
      'cash.view_all',
      'checkin.scan',
      'checkin.manual',
      'checkin.monitor',
      'gates.manage',
      'reports.view',
      'reports.export',
      'marketing.view',
      'communications.view',
      'communications.send',
      'users.view',
      'settings.view',
      'audit.view',
    ],
  },
  {
    key: 'FINANCE',
    name: 'Financeiro',
    description: 'Pagamentos, reembolsos, conciliação, caixas e relatórios financeiros.',
    permissions: [
      'dashboard.view',
      'dashboard.financial',
      'orders.view',
      'orders.export',
      'tickets.view',
      'customers.view',
      'coupons.view',
      'payments.view',
      'payments.reconcile',
      'refunds.request',
      'refunds.approve',
      'finance.view',
      'finance.export',
      'cash.view_all',
      'reports.view',
      'reports.export',
      'audit.view',
    ],
  },
  {
    key: 'BOX_OFFICE',
    name: 'Bilheteria',
    description: 'Vende na bilheteria e opera o próprio caixa.',
    permissions: [
      'dashboard.view',
      'calendar.view',
      'ticket_types.view',
      'orders.view',
      'tickets.view',
      'tickets.resend',
      'customers.view',
      'customers.manage',
      'pos.sell',
      'cash.operate',
    ],
  },
  {
    key: 'GATE',
    name: 'Portaria',
    description: 'Lê QR Codes e libera a entrada dos visitantes.',
    permissions: ['checkin.scan', 'checkin.manual'],
  },
  {
    key: 'SUPPORT',
    name: 'Atendimento',
    description: 'Atende clientes: pedidos, ingressos, reenvios e mensagens.',
    permissions: [
      'dashboard.view',
      'calendar.view',
      'ticket_types.view',
      'orders.view',
      'tickets.view',
      'tickets.resend',
      'tickets.manage',
      'customers.view',
      'customers.manage',
      'refunds.request',
      'communications.view',
      'communications.send',
    ],
  },
  {
    key: 'MARKETING',
    name: 'Marketing',
    description: 'Cupons, funil de vendas, origem das vendas e relatórios.',
    permissions: [
      'dashboard.view',
      'calendar.view',
      'ticket_types.view',
      'customers.view',
      'coupons.view',
      'coupons.manage',
      'reports.view',
      'marketing.view',
      'communications.view',
    ],
  },
  {
    key: 'READ_ONLY',
    name: 'Leitura',
    description: 'Consulta painéis e relatórios, sem alterar nada.',
    permissions: [
      'dashboard.view',
      'calendar.view',
      'ticket_types.view',
      'orders.view',
      'tickets.view',
      'customers.view',
      'coupons.view',
      'payments.view',
      'finance.view',
      'checkin.monitor',
      'reports.view',
      'marketing.view',
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
