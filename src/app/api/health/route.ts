import { NextResponse } from 'next/server';

import { prisma } from '@/server/db';
import { logger } from '@/server/logger';

/**
 * Verificação de saúde para a hospedagem e o monitoramento. Público de
 * propósito, sem nenhum dado sensível: só diz se o app e o banco respondem.
 */
export async function GET(): Promise<NextResponse> {
  const inicio = performance.now();
  let banco: 'ok' | 'indisponivel' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (erro) {
    banco = 'indisponivel';
    logger.error({ err: erro }, 'health check: banco indisponível');
  }

  return NextResponse.json(
    {
      status: banco === 'ok' ? 'ok' : 'degradado',
      checks: { database: banco },
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.APP_VERSION ?? 'dev',
      time: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - inicio),
    },
    { status: banco === 'ok' ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
