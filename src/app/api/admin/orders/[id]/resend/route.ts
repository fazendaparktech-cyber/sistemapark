import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, route, type IdRouteContext } from '@/server/http';
import { resendOrderEmail } from '@/server/orders/admin';

export const POST = route<IdRouteContext>(async ({ ctx, meta }) => {
  const auth = await requireApiAuth();
  await resendOrderEmail(auth, await readIdParam(ctx), meta);
  return ok({ sent: true });
});
