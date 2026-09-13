/**
 * Contrato dos provedores de e-mail. O sistema só conhece esta interface;
 * trocar de provedor é trocar a implementação escolhida por variável de ambiente.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Categoria da mensagem, para relatórios do provedor (ex.: password_reset). */
  tag: string;
  /** Repetir o envio com a mesma chave não gera e-mail duplicado. */
  idempotencyKey?: string;
}

export interface EmailSendResult {
  provider: string;
  providerMessageId: string;
}

export interface EmailProvider {
  readonly id: 'mock' | 'resend';
  send(message: EmailMessage): Promise<EmailSendResult>;
}
