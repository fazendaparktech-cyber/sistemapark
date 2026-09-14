/** Nomes em português das ações gravadas na auditoria. Ação sem rótulo aparece com o código. */
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  'auth.login': 'Entrou no sistema',
  'auth.login_failed': 'Tentativa de login recusada',
  'auth.login_throttled': 'Login bloqueado por excesso de tentativas',
  'auth.logout': 'Saiu do sistema',
  'auth.password_changed': 'Trocou a própria senha',
  'auth.password_reset_requested': 'Pediu link para redefinir a senha',
  'auth.password_reset': 'Redefiniu a senha pelo link',
  'users.created': 'Cadastrou pessoa na equipe',
  'users.updated': 'Alterou dados de pessoa da equipe',
  'users.roles_changed': 'Alterou papéis de acesso',
  'users.status_changed': 'Alterou a situação do acesso',
  'users.password_reset_by_admin': 'Gerou senha temporária',
  'users.sessions_revoked': 'Encerrou sessões abertas',
  'roles.permissions_changed': 'Alterou permissões de um papel',
  'orders.created': 'Pedido criado',
  'orders.confirmed': 'Pedido confirmado',
  'orders.confirmed_late': 'Pedido confirmado com pagamento fora do prazo',
  'orders.expired': 'Pedido vencido sem pagamento',
  'orders.cancelled': 'Cancelou pedido',
  'orders.refunded': 'Reembolsou pedido',
  'orders.paid_after_cancel': 'Pagamento recebido depois do cancelamento',
  'orders.late_payment_conflict': 'Pagamento fora do prazo sem vaga disponível',
  'orders.email_resent': 'Reenviou o e-mail do pedido',
  'orders.whatsapp_shared': 'Enviou os ingressos pelo WhatsApp',
  'orders.link_regenerated': 'Gerou novo link do pedido',
  'orders.exported': 'Exportou planilha de vendas',
  'payments.reconciled': 'Consultou pagamento no provedor',
  'payments.amount_mismatch': 'Valor pago diferente do cobrado',
  'customers.updated': 'Alterou cadastro de cliente',
  'customers.exported': 'Exportou planilha de clientes',
  'coupons.created': 'Criou cupom',
  'coupons.updated': 'Alterou cupom',
  'coupons.activated': 'Ativou cupom',
  'coupons.deactivated': 'Desativou cupom',
  'coupons.deleted': 'Excluiu cupom',
  'ticket_types.created': 'Criou tipo de ingresso',
  'ticket_types.updated': 'Alterou tipo de ingresso',
  'ticket_types.reordered': 'Mudou a ordem dos ingressos',
  'prices.rule_created': 'Criou regra de preço',
  'prices.rule_updated': 'Alterou regra de preço',
  'prices.rule_deleted': 'Excluiu regra de preço',
  'calendar.period_applied': 'Aplicou horário e lotação a um período',
  'calendar.day_created': 'Configurou dia no calendário',
  'calendar.day_updated': 'Alterou dia do calendário',
  'settings.sales_updated': 'Alterou as regras de venda online',
  'settings.policies_updated': 'Alterou as políticas do site',
  'settings.park_updated': 'Alterou os dados do parque',
};

export const AUDIT_REASON_LABELS: Readonly<Record<string, string>> = {
  UNKNOWN_EMAIL: 'e-mail sem acesso cadastrado',
  WRONG_PASSWORD: 'senha incorreta',
  STATUS_SUSPENDED: 'acesso suspenso',
  STATUS_DISABLED: 'acesso desativado',
  NO_PARK_ACCESS: 'sem acesso a nenhum parque',
};

export const AUDIT_ACTION_GROUPS = [
  { value: 'auth.', label: 'Acesso ao sistema' },
  { value: 'orders.', label: 'Vendas' },
  { value: 'payments.', label: 'Pagamentos' },
  { value: 'customers.', label: 'Clientes' },
  { value: 'coupons.', label: 'Cupons' },
  { value: 'ticket_types.', label: 'Tipos de ingresso' },
  { value: 'prices.', label: 'Preços' },
  { value: 'calendar.', label: 'Calendário' },
  { value: 'settings.', label: 'Configurações' },
  { value: 'users.', label: 'Equipe' },
  { value: 'roles.', label: 'Permissões' },
] as const;

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** Ações feitas por quem ainda não entrou no sistema: não há como saber quem foi. */
const ACOES_SEM_IDENTIFICACAO = new Set([
  'auth.login_failed',
  'auth.login_throttled',
  'auth.password_reset_requested',
]);

const TIPOS_DE_AUTOR: Readonly<Record<string, string>> = {
  SYSTEM: 'Sistema',
  WEBHOOK: 'Integração',
  CUSTOMER: 'Cliente',
  USER: 'Equipe',
};

/** Quem aparece quando o registro não está ligado a uma pessoa da equipe. */
export function auditActorFallback(action: string, actorType: string): string {
  if (ACOES_SEM_IDENTIFICACAO.has(action)) return 'Não identificado';
  return TIPOS_DE_AUTOR[actorType] ?? actorType;
}
