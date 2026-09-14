import { z } from '@/lib/validation';
import { requireApiAuth } from '@/server/auth/cookies';
import { setCouponActive } from '@/server/coupons/service';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';

const situacao = z.strictObject({ isActive: z.boolean() });

export const POST = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const { isActive } = await readJson(req, situacao);
  return ok(await setCouponActive(auth, id, isActive, meta));
});
