import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, route, type IdRouteContext } from '@/server/http';
import { revokeSessionsOfUser } from '@/server/users/service';

export const DELETE = route<IdRouteContext>(async ({ ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  return ok(await revokeSessionsOfUser(auth, id, meta));
});
