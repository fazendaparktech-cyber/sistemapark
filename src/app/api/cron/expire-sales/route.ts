import { safeEqual } from '@/server/crypto';
import { AppError } from '@/server/errors';
import { ok, route } from '@/server/http';
import { expireStaleSales } from '@/server/sales/expiration';
import { secret } from '@/server/secrets';

/**
 * Rotina de vencimento de carrinhos e pedidos não pagos. Chamar a cada 5
 * minutos pelo agendador da hospedagem, com `Authorization: Bearer <CRON_SECRET>`.
 */
const executar = route(async ({ req }) => {
  const recebido = req.headers.get('authorization') ?? '';
  if (!safeEqual(recebido, `Bearer ${secret('CRON_SECRET')}`)) {
    throw new AppError('UNAUTHENTICATED', 'Credencial da rotina inválida.');
  }
  return ok(await expireStaleSales());
});

export const GET = executar;
export const POST = executar;
