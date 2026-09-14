import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, route, type IdRouteContext } from '@/server/http';
import { reconcilePayment } from '@/server/payments/service';

export const POST = route<IdRouteContext>(async ({ ctx, meta }) => {
  const auth = await requireApiAuth();
  return ok(await reconcilePayment(auth, await readIdParam(ctx), meta));
});
