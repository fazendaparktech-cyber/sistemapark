import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { prisma } from '@/server/db';
import { consumeRateLimit, enforceRateLimit, rateLimitKey } from '@/server/rate-limit';

import { expectAppError } from '../helpers/factories';

function regra(limit: number, windowSeconds = 60) {
  return { key: `teste:${randomUUID()}`, limit, windowSeconds };
}

describe('limite de tentativas', () => {
  it('permite até o limite e recusa a seguinte com tempo de espera', async () => {
    const r = regra(3);
    for (let i = 1; i <= 3; i++) {
      const resultado = await consumeRateLimit(r);
      expect(resultado.allowed).toBe(true);
      expect(resultado.count).toBe(i);
    }
    const recusado = await expectAppError(enforceRateLimit(r), 'RATE_LIMITED');
    expect(recusado.headers['Retry-After']).toMatch(/^\d+$/);
    expect(Number(recusado.details.retryAfterSeconds)).toBeGreaterThan(0);
    expect(Number(recusado.details.retryAfterSeconds)).toBeLessThanOrEqual(60);
  });

  it('conta certo com 20 requisições simultâneas', async () => {
    const r = regra(5);
    const resultados = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit(r)));
    expect(resultados.filter((resultado) => resultado.allowed)).toHaveLength(5);
    expect(resultados.map((resultado) => resultado.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('recomeça a contagem quando a janela vence', async () => {
    const r = regra(2, 60);
    await consumeRateLimit(r);
    await consumeRateLimit(r);
    expect((await consumeRateLimit(r)).allowed).toBe(false);

    await prisma.$executeRaw`UPDATE rate_limits SET window_started_at = now() - interval '2 minutes' WHERE key = ${r.key}`;
    const depois = await consumeRateLimit(r);
    expect(depois.allowed).toBe(true);
    expect(depois.count).toBe(1);
  });

  it('não grava e-mail nem IP na chave', () => {
    const chave = rateLimitKey('login:email-ip', 'fulano@parque.com', '203.0.113.9');
    expect(chave).toMatch(/^login:email-ip:[0-9a-f]{40}$/);
    expect(chave).not.toContain('fulano');
  });
});
