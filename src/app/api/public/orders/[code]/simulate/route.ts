import { z } from '@/lib/validation';
import { Errors } from '@/server/errors';
import { ok, readJson, route } from '@/server/http';
import { findAccessibleOrder } from '@/server/orders/status';
import { getPublicPark } from '@/server/parks/public';
import { paymentSimulationEnabled, simulateMockPayment } from '@/server/payments/service';

interface CodeRouteContext {
  params: Promise<{ code: string }>;
}

const corpo = z.strictObject({ token: z.string().max(64), outcome: z.enum(['APPROVED', 'DECLINED']) });

/** Ambiente de teste: simula o banco aprovando ou recusando o PIX. Não existe em produção. */
export const POST = route<CodeRouteContext>(async ({ req, ctx }) => {
  if (!paymentSimulationEnabled()) throw Errors.notFound();
  const { code } = await ctx.params;
  const { token, outcome } = await readJson(req, corpo);
  const parque = await getPublicPark();
  const pedido = await findAccessibleOrder(parque.id, code, token);
  if (!pedido) throw Errors.notFound('Pedido não encontrado.');
  return ok({ result: await simulateMockPayment({ orderId: pedido.id, outcome }) });
});
