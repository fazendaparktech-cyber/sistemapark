import 'server-only';

import type { PaymentStatus } from '@/generated/prisma/client';

import { hmacSha256, randomCrockford, randomToken, safeEqual } from '../crypto';
import { prisma, type DbClient } from '../db';
import { AppError } from '../errors';
import { secret } from '../secrets';
import type { ChargeSnapshot, PaymentGateway, PixCharge, PixChargeInput, WebhookNotification } from './types';

/**
 * Provedor de teste. Guarda as cobranças na tabela `dev_mock_charges` e
 * permite aprovar ou recusar pelo próprio sistema, passando pelo mesmo
 * caminho de um webhook real (assinatura, idempotência, consulta de status).
 * Nunca é usado em produção (ver `onlinePaymentsAvailable`).
 */

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

/** Chave aleatória (EVP) zerada: não existe em nenhum banco, então o código não é pagável. */
const CHAVE_PIX_FICTICIA = '00000000-0000-0000-0000-000000000000';

function campo(id: string, valor: string): string {
  return `${id}${valor.length.toString().padStart(2, '0')}${valor}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function semAcento(texto: string, maximo: number): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .slice(0, maximo);
}

/** BR Code no formato do PIX, com chave fictícia. Serve para a tela de pagamento ficar igual à real. */
export function mockPixPayload(input: { amountCents: number; txid: string }): string {
  const valor = `${Math.floor(input.amountCents / 100)}.${(input.amountCents % 100).toString().padStart(2, '0')}`;
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', CHAVE_PIX_FICTICIA);
  const semCrc =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valor) +
    campo('58', 'BR') +
    campo('59', semAcento('Conquista Park Teste', 25)) +
    campo('60', semAcento('Ubata', 15)) +
    campo('62', campo('05', semAcento(input.txid, 25).replace(/ /g, ''))) +
    '6304';
  return semCrc + crc16(semCrc);
}

export class MockPaymentGateway implements PaymentGateway {
  readonly provider = 'MOCK' as const;

  constructor(private readonly db: DbClient = prisma) {}

  async createPixCharge(input: PixChargeInput): Promise<PixCharge> {
    const id = `mock_${randomCrockford(20).toLowerCase()}`;
    await this.db.devMockCharge.create({ data: { id, amountCents: input.amountCents } });
    return {
      providerPaymentId: id,
      pixPayload: mockPixPayload({ amountCents: input.amountCents, txid: id }),
      expiresAt: input.expiresAt,
    };
  }

  async getCharge(providerPaymentId: string): Promise<ChargeSnapshot | null> {
    const cobranca = await this.db.devMockCharge.findUnique({ where: { id: providerPaymentId } });
    if (!cobranca) return null;
    const paga = cobranca.status === 'APPROVED' || cobranca.status === 'REFUNDED';
    return {
      providerPaymentId: cobranca.id,
      status: cobranca.status,
      amountCents: cobranca.amountCents,
      refundedCents: cobranca.status === 'REFUNDED' ? cobranca.amountCents : 0,
      feeCents: paga ? 0 : null,
      paidAt: paga ? cobranca.updatedAt : null,
    };
  }

  async cancelCharge(providerPaymentId: string): Promise<void> {
    await this.db.devMockCharge.updateMany({
      where: { id: providerPaymentId, status: 'AWAITING' },
      data: { status: 'CANCELLED' },
    });
  }

  async refundCharge(providerPaymentId: string, amountCents: number): Promise<ChargeSnapshot> {
    const cobranca = await this.db.devMockCharge.findUnique({ where: { id: providerPaymentId } });
    if (!cobranca || cobranca.status !== 'APPROVED') {
      throw new AppError(
        'PAYMENT_PROVIDER_ERROR',
        'O provedor recusou o reembolso: a cobrança não está paga.',
      );
    }
    if (amountCents !== cobranca.amountCents) {
      throw new AppError('PAYMENT_PROVIDER_ERROR', 'O provedor de teste só faz reembolso do valor total.');
    }
    await this.db.devMockCharge.update({ where: { id: providerPaymentId }, data: { status: 'REFUNDED' } });
    const atualizada = await this.getCharge(providerPaymentId);
    if (!atualizada) throw new AppError('PAYMENT_PROVIDER_ERROR', 'Cobrança não encontrada no provedor.');
    return atualizada;
  }

  /** Muda o status da cobrança, como se o cliente tivesse pago (ou o banco recusado). */
  async setChargeStatus(providerPaymentId: string, status: PaymentStatus): Promise<void> {
    await this.db.devMockCharge.update({ where: { id: providerPaymentId }, data: { status } });
  }

  signWebhook(rawBody: string): string {
    return hmacSha256(secret('MOCK_WEBHOOK_SECRET'), rawBody).toString('hex');
  }

  /** Corpo e cabeçalhos de um aviso de pagamento, assinados como o provedor faria. */
  buildWebhook(providerPaymentId: string): { body: string; headers: Headers } {
    const body = JSON.stringify({
      id: `evt_${randomToken(12)}`,
      event: 'PAYMENT_UPDATED',
      payment: { id: providerPaymentId },
    });
    return { body, headers: new Headers({ [MOCK_SIGNATURE_HEADER]: this.signWebhook(body) }) };
  }

  verifyWebhook(headers: Headers, rawBody: string): boolean {
    const assinatura = headers.get(MOCK_SIGNATURE_HEADER);
    if (!assinatura) return false;
    return safeEqual(this.signWebhook(rawBody), assinatura);
  }

  parseWebhook(rawBody: string): WebhookNotification | null {
    try {
      const corpo = JSON.parse(rawBody) as { id?: unknown; event?: unknown; payment?: { id?: unknown } };
      if (typeof corpo.id !== 'string' || typeof corpo.event !== 'string') return null;
      return {
        externalId: corpo.id.slice(0, 120),
        eventType: corpo.event.slice(0, 80),
        providerPaymentId: typeof corpo.payment?.id === 'string' ? corpo.payment.id : null,
      };
    } catch {
      return null;
    }
  }
}
