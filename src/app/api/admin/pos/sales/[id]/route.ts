import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, route, type IdRouteContext } from '@/server/http';
import { getPosSaleStatus } from '@/server/sales/pos';

export const GET = route<IdRouteContext>(async ({ ctx }) => {
  const auth = await requireApiAuth();
  return ok(await getPosSaleStatus(auth, await readIdParam(ctx)));
});
