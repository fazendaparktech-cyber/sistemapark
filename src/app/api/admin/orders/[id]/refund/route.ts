import { orderReasonSchema } from '@/lib/orders';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';
import { refundOrder } from '@/server/orders/admin';

export const POST = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const dados = await readJson(req, orderReasonSchema);
  return ok(await refundOrder(auth, id, dados, meta));
});
