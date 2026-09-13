import 'server-only';

import type { PaymentProvider } from '@/generated/prisma/client';

import { AppError } from '../errors';
import { MockPaymentGateway } from './mock';
import type { PaymentGateway } from './types';

export type { ChargeSnapshot, PaymentGateway, PixCharge, PixChargeInput, WebhookNotification } from './types';

let mock: MockPaymentGateway | undefined;
let substituto: PaymentGateway | undefined;

export function mockGateway(): MockPaymentGateway {
  mock ??= new MockPaymentGateway();
  return mock;
}

/** Provedor usado nas cobranças novas. */
export function paymentGateway(): PaymentGateway {
  return substituto ?? mockGateway();
}

/** Provedor de uma cobrança já existente (pode ser diferente do atual). */
export function gatewayFor(provider: PaymentProvider): PaymentGateway {
  if (substituto && substituto.provider === provider) return substituto;
  if (provider === 'MOCK') return mockGateway();
  throw new AppError('PAYMENT_PROVIDER_ERROR', `Provedor de pagamento ${provider} não está configurado.`);
}

/** Só para testes: injeta um provedor controlado. */
export function setPaymentGatewayForTesting(novo: PaymentGateway | undefined): void {
  substituto = novo;
}
