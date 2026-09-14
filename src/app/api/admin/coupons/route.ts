import { couponInputSchema } from '@/lib/coupon-schemas';
import { requireApiAuth } from '@/server/auth/cookies';
import { createCoupon, listCouponsAdmin } from '@/server/coupons/service';
import { ok, readJson, route } from '@/server/http';

export const GET = route(async () => {
  const auth = await requireApiAuth();
  return ok(await listCouponsAdmin(auth));
});

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, couponInputSchema);
  return ok(await createCoupon(auth, dados, meta), { status: 201 });
});
