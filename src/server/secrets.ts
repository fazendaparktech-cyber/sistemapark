import 'server-only';

/**
 * Chaves secretas do sistema. Em produção precisam estar configuradas (32+
 * caracteres) e guardadas também fora do servidor: sem a chave de QR os
 * ingressos emitidos deixam de ser validados; sem a de CPF, a busca por CPF.
 * Em desenvolvimento e testes há valores fixos, que nunca valem em produção.
 */

export type SecretName =
  'QR_SIGNING_KEY' | 'ORDER_LINK_KEY' | 'CPF_HASH_KEY' | 'CRON_SECRET' | 'MOCK_WEBHOOK_SECRET';

export const MIN_SECRET_LENGTH = 32;

const SOMENTE_DESENVOLVIMENTO: Readonly<Record<SecretName, string>> = {
  QR_SIGNING_KEY: 'somente-desenvolvimento-chave-de-qr-conquista-park',
  ORDER_LINK_KEY: 'somente-desenvolvimento-chave-de-link-de-pedido',
  CPF_HASH_KEY: 'somente-desenvolvimento-chave-de-cpf-conquista-park',
  CRON_SECRET: 'somente-desenvolvimento-segredo-das-tarefas-agendadas',
  MOCK_WEBHOOK_SECRET: 'somente-desenvolvimento-segredo-do-webhook-de-teste',
};

export function secret(name: SecretName): string {
  const valor = process.env[name];
  if (valor && valor.length >= MIN_SECRET_LENGTH) return valor;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Configure ${name} com pelo menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  return SOMENTE_DESENVOLVIMENTO[name];
}
