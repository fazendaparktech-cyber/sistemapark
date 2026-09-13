import 'server-only';

import { sha256Hex } from './crypto';
import { prisma, type DbClient } from './db';
import { Errors } from './errors';

/**
 * Limite de tentativas em janela fixa, guardado no Postgres (funciona com
 * várias instâncias do servidor, sem Redis). Uma única instrução atômica conta
 * a tentativa — duas requisições simultâneas nunca leem o mesmo valor.
 */

export interface RateLimitRule {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
}

/** Chave sem dado pessoal: e-mails e IPs viram hash antes de ir para o banco. */
export function rateLimitKey(scope: string, ...parts: readonly (string | null | undefined)[]): string {
  return `${scope}:${sha256Hex(parts.map((parte) => parte ?? '-').join('|')).slice(0, 40)}`;
}

/** Soma uma tentativa e devolve a contagem da janela. */
export async function consumeRateLimit(rule: RateLimitRule, db: DbClient = prisma): Promise<RateLimitResult> {
  const linhas = await db.$queryRaw<{ count: number; retry_after: number }[]>`
    INSERT INTO rate_limits AS rl (key, count, window_started_at)
    VALUES (${rule.key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rl.window_started_at <= now() - ${rule.windowSeconds}::int * interval '1 second' THEN 1
        ELSE rl.count + 1
      END,
      window_started_at = CASE
        WHEN rl.window_started_at <= now() - ${rule.windowSeconds}::int * interval '1 second' THEN now()
        ELSE rl.window_started_at
      END
    RETURNING
      count,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_started_at + ${rule.windowSeconds}::int * interval '1 second' - now()))))::int AS retry_after`;

  const linha = linhas[0];
  const count = linha?.count ?? 1;
  return {
    allowed: count <= rule.limit,
    count,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: linha?.retry_after ?? rule.windowSeconds,
  };
}

/**
 * Lê a contagem da janela sem somar. `allowed` indica que ainda cabe mais uma
 * tentativa. Usado para limites que só contam falhas.
 */
export async function peekRateLimit(rule: RateLimitRule, db: DbClient = prisma): Promise<RateLimitResult> {
  const linhas = await db.$queryRaw<{ count: number; retry_after: number }[]>`
    SELECT
      count,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_started_at + ${rule.windowSeconds}::int * interval '1 second' - now()))))::int AS retry_after
    FROM rate_limits
    WHERE key = ${rule.key}
      AND window_started_at > now() - ${rule.windowSeconds}::int * interval '1 second'`;

  const linha = linhas[0];
  const count = linha?.count ?? 0;
  return {
    allowed: count < rule.limit,
    count,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: linha?.retry_after ?? 0,
  };
}

/** Conta a tentativa e recusa com 429 quando passa do limite. */
export async function enforceRateLimit(rule: RateLimitRule, db: DbClient = prisma): Promise<RateLimitResult> {
  const resultado = await consumeRateLimit(rule, db);
  if (!resultado.allowed) throw Errors.rateLimited(resultado.retryAfterSeconds);
  return resultado;
}

export async function clearRateLimit(key: string, db: DbClient = prisma): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
}

/** Limpeza periódica das janelas antigas. */
export async function purgeRateLimits(olderThanSeconds = 86_400, db: DbClient = prisma): Promise<number> {
  const { count } = await db.rateLimit.deleteMany({
    where: { windowStartedAt: { lt: new Date(Date.now() - olderThanSeconds * 1000) } },
  });
  return count;
}
