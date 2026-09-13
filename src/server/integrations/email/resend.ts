import 'server-only';

import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

/** Resend via API HTTP — sem SDK, só `fetch`. */
export class ResendEmailProvider implements EmailProvider {
  readonly id = 'resend' as const;
  private readonly apiKey: string;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey;
    this.from = from;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (message.idempotencyKey) headers['Idempotency-Key'] = message.idempotencyKey;

    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [{ name: 'tipo', value: message.tag }],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => '');
      throw new Error(`Resend recusou o envio (HTTP ${resposta.status}): ${corpo.slice(0, 300)}`);
    }

    const dados = (await resposta.json()) as { id?: unknown };
    if (typeof dados.id !== 'string') throw new Error('Resend não devolveu o id da mensagem.');
    return { provider: 'resend', providerMessageId: dados.id };
  }
}
