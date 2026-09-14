import { z } from '@/lib/validation';
import { AppError, Errors } from '@/server/errors';
import { ok, readJson, route } from '@/server/http';
import { findAccessibleOrder } from '@/server/orders/status';
import { getPublicPark } from '@/server/parks/public';
import { ensurePixPayment } from '@/server/payments/service';

interface CodeRouteContext {
  params: Promise<{ code: string }>;
}

const corpo = z.strictObject({ token: z.string().max(64) });

/** Gera o código PIX de novo (ex.: a primeira tentativa falhou no provedor). */
export const POST = route<CodeRouteContext>(async ({ req, ctx }) => {
  const { code } = await ctx.params;
  const { token } = await readJson(req, corpo);
  const parque = await getPublicPark();
  const pedido = await findAccessibleOrder(parque.id, code, token);
  if (!pedido) throw Errors.notFound('Pedido não encontrado.');
  const pagamento = await ensurePixPayment(pedido.id);
  if (!pagamento) throw new AppError('ORDER_NOT_PAYABLE', 'Este pedido não está mais aguardando pagamento.');
  return ok({ status: pagamento.status });
});
