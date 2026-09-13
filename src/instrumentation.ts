/**
 * Roda uma vez quando o servidor sobe. Se a configuração estiver inválida, o
 * processo para aqui com a lista do que corrigir — melhor do que falhar no
 * meio de uma venda.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { env } = await import('./server/env');
  const { logger } = await import('./server/logger');
  const config = env();
  logger.info(
    { nodeEnv: config.NODE_ENV, emailProvider: config.EMAIL_PROVIDER, appUrl: config.APP_URL },
    'sistema iniciado',
  );
}
