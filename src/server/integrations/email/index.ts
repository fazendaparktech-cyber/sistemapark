import 'server-only';

import { env } from '../../env';
import { MockEmailProvider } from './mock';
import { ResendEmailProvider } from './resend';
import type { EmailProvider } from './types';

export type { EmailMessage, EmailProvider, EmailSendResult } from './types';

let provedor: EmailProvider | undefined;

export function emailProvider(): EmailProvider {
  if (!provedor) {
    const config = env();
    provedor =
      config.EMAIL_PROVIDER === 'resend' && config.RESEND_API_KEY
        ? new ResendEmailProvider(config.RESEND_API_KEY, config.EMAIL_FROM)
        : new MockEmailProvider();
  }
  return provedor;
}

/** Só para testes: injeta um provedor controlado. */
export function setEmailProviderForTesting(novo: EmailProvider | undefined): void {
  provedor = novo;
}
