import 'server-only';

import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de senha com argon2id nos parâmetros mínimos recomendados pela OWASP
 * (19 MiB de memória, 2 iterações, 1 thread). O algoritmo padrão da biblioteca
 * já é o argon2id.
 */
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const PREFIXO_ATUAL = '$argon2id$v=19$m=19456,t=2,p=1$';

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Hash gravado com parâmetros antigos: refazer no próximo login bem-sucedido. */
export function passwordNeedsRehash(passwordHash: string): boolean {
  return !passwordHash.startsWith(PREFIXO_ATUAL);
}

let hashDescartavel: Promise<string> | undefined;

/**
 * Faz o mesmo trabalho de uma verificação real quando o e-mail não existe, para
 * que o tempo de resposta não revele quais e-mails têm conta.
 */
export async function simulatePasswordCheck(password: string): Promise<false> {
  hashDescartavel ??= hash('conta-inexistente-apenas-para-igualar-o-tempo', ARGON2);
  await verifyPassword(await hashDescartavel, password);
  return false;
}
