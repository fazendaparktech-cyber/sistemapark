import 'server-only';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Primitivas criptográficas do sistema. Token, código e senha nunca usam
 * `Math.random`.
 */

/** Token aleatório em base64url. 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 em hexadecimal (64 caracteres). Tokens de sessão e de recuperação ficam no banco assim. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hmacSha256(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

/** Compara dois textos em tempo constante: o tempo de resposta não revela quantos caracteres batem. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/** Crockford Base32: sem I, L, O e U — não se confunde ao ler em voz alta nem ao digitar. */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Código aleatório em Crockford Base32; cada caractere carrega 5 bits, sem viés (256 é múltiplo de 32). */
export function randomCrockford(length: number): string {
  if (!Number.isInteger(length) || length <= 0) throw new RangeError('Tamanho de código inválido');
  let code = '';
  for (const byte of randomBytes(length)) code += CROCKFORD_ALPHABET.charAt(byte & 31);
  return code;
}

/** Senha gerada pelo sistema para o primeiro acesso: 20 caracteres Crockford (100 bits) em blocos. */
export function generateStrongPassword(): string {
  const bruta = randomCrockford(20);
  return `${bruta.slice(0, 5)}-${bruta.slice(5, 10)}-${bruta.slice(10, 15)}-${bruta.slice(15)}`;
}
