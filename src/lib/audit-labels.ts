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
