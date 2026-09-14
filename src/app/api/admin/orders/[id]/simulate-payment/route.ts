import { z } from '@/lib/validation';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';
import { simulateOrderPayment } from '@/server/orders/admin';

const resultado = z.strictObject({ outcome: z.enum(['APPROVED', 'DECLINED']) });

/** Só no ambiente de teste: aprova ou recusa o PIX como se fosse o banco. */
export const POST = route<IdRouteContext>(async ({ req, ctx }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const { outcome } = await readJson(req, resultado);
  return ok(await simulateOrderPayment(auth, id, outcome));
});
