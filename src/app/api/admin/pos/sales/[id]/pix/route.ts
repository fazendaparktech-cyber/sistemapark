import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, route, type IdRouteContext } from '@/server/http';
import { retryPosPix } from '@/server/sales/pos';

export const POST = route<IdRouteContext>(async ({ ctx }) => {
  const auth = await requireApiAuth();
  return ok(await retryPosPix(auth, await readIdParam(ctx)));
});
