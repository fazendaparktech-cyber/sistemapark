import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, route, type IdRouteContext } from '@/server/http';
import { getOrderAdmin } from '@/server/orders/admin';

export const GET = route<IdRouteContext>(async ({ ctx }) => {
  const auth = await requireApiAuth();
  return ok(await getOrderAdmin(auth, await readIdParam(ctx)));
});
