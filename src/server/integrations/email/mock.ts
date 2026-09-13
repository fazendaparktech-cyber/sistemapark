import 'server-only';

import { randomUUID } from 'node:crypto';

import { logger } from '../../logger';
import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

export interface MockEmail extends EmailMessage {
  providerMessageId: string;
  sentAt: Date;
}

/**
 * Provedor de mentira para desenvolvimento e testes: guarda as mensagens em
 * memória e, em desenvolvimento, mostra o texto no terminal (é assim que se
 * pega o link de redefinição de senha localmente). Bloqueado em produção pela
 * validação de ambiente.
 */
export class MockEmailProvider implements EmailProvider {
  readonly id = 'mock' as const;
  readonly outbox: MockEmail[] = [];

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const providerMessageId = `mock_${randomUUID()}`;
    this.outbox.push({ ...message, providerMessageId, sentAt: new Date() });
    logger.info({ tag: message.tag, providerMessageId }, 'e-mail simulado');
    if (process.env.NODE_ENV === 'development') {
      console.info(
        `\n──── e-mail simulado ────\nPara: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n────────────────────────\n`,
      );
    }
    return { provider: 'mock', providerMessageId };
  }

  lastTo(to: string): MockEmail | undefined {
    return this.outbox.filter((mensagem) => mensagem.to === to).at(-1);
  }
}
