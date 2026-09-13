import 'server-only';

import { CROCKFORD_ALPHABET, hmacSha256, safeEqual } from './crypto';
import { secret } from './secrets';

/**
 * Assinaturas do sistema: QR Code do ingresso, link do pedido e hash de CPF.
 * Cada uso tem a própria chave, para poder trocar uma sem afetar as outras.
 */

export function base32Crockford(bytes: Uint8Array): string {
  let saida = '';
  let acumulado = 0;
  let bits = 0;
  for (const byte of bytes) {
    acumulado = ((acumulado << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      saida += CROCKFORD_ALPHABET.charAt((acumulado >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) saida += CROCKFORD_ALPHABET.charAt((acumulado << (5 - bits)) & 31);
  return saida;
}

// ─── QR Code do ingresso ────────────────────────────────────────────────────

/** Formato e versão da chave: `CP1.<CÓDIGO>.<ASSINATURA>`. */
export const TICKET_QR_PREFIX = 'CP1';
const QR = /^CP1\.([0-9A-HJKMNP-TV-Z]{10})\.([0-9A-HJKMNP-TV-Z]{26})$/;

export interface QrTicket {
  parkId: string;
  code: string;
  qrVersion: number;
}

function assinaturaDoQr(ingresso: QrTicket): string {
  const mac = hmacSha256(
    secret('QR_SIGNING_KEY'),
    `qr|${ingresso.parkId}|${ingresso.code}|${ingresso.qrVersion}`,
  );
  return base32Crockford(mac).slice(0, 26);
}

/** Conteúdo do QR: sem dado pessoal, sem link e impossível de gerar sem a chave. */
export function ticketQrPayload(ingresso: QrTicket): string {
  return `${TICKET_QR_PREFIX}.${ingresso.code}.${assinaturaDoQr(ingresso)}`;
}

export function parseTicketQr(conteudo: string): { code: string; signature: string } | null {
  const m = QR.exec(conteudo.trim().toUpperCase());
  if (!m?.[1] || !m[2]) return null;
  return { code: m[1], signature: m[2] };
}

export function isTicketQrSignatureValid(ingresso: QrTicket, assinatura: string): boolean {
  return safeEqual(assinaturaDoQr(ingresso), assinatura);
}

// ─── Link do pedido ─────────────────────────────────────────────────────────

export interface AccessibleOrder {
  id: string;
  accessVersion: number;
}

/** Token do link do pedido. Trocar `accessVersion` invalida os links antigos. */
export function orderAccessToken(pedido: AccessibleOrder): string {
  return hmacSha256(secret('ORDER_LINK_KEY'), `pedido|${pedido.id}|${pedido.accessVersion}`)
    .toString('base64url')
    .slice(0, 32);
}

export function isOrderAccessTokenValid(pedido: AccessibleOrder, token: string | null | undefined): boolean {
  if (typeof token !== 'string' || token.length !== 32) return false;
  return safeEqual(orderAccessToken(pedido), token);
}

// ─── CPF ────────────────────────────────────────────────────────────────────

/** HMAC do CPF (só dígitos): permite busca exata sem guardar o número. */
export function hashCpf(cpfDigits: string): string {
  return hmacSha256(secret('CPF_HASH_KEY'), `cpf|${cpfDigits}`).toString('hex');
}
