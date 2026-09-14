import { couponInputSchema } from '@/lib/coupon-schemas';
import { requireApiAuth } from '@/server/auth/cookies';
import { deleteCoupon, getCouponAdmin, updateCoupon } from '@/server/coupons/service';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';

export const GET = route<IdRouteContext>(async ({ ctx }) => {
  const auth = await requireApiAuth();
  return ok(await getCouponAdmin(auth, await readIdParam(ctx)));
});

export const PUT = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const dados = await readJson(req, couponInputSchema);
  return ok(await updateCoupon(auth, id, dados, meta));
});

export const DELETE = route<IdRouteContext>(async ({ ctx, meta }) => {
  const auth = await requireApiAuth();
  await deleteCoupon(auth, await readIdParam(ctx), meta);
  return ok({ deleted: true });
});
