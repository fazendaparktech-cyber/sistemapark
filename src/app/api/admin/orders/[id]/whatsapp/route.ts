import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, route, type IdRouteContext } from '@/server/http';
import { shareOrderWhatsapp } from '@/server/orders/admin';

export const POST = route<IdRouteContext>(async ({ ctx, meta }) => {
  const auth = await requireApiAuth();
  return ok(await shareOrderWhatsapp(auth, await readIdParam(ctx), meta));
});
