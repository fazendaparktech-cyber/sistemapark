import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, route, type IdRouteContext } from '@/server/http';
import { resetUserPassword } from '@/server/users/service';

export const POST = route<IdRouteContext>(async ({ ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  return ok(await resetUserPassword(auth, id, meta));
});
