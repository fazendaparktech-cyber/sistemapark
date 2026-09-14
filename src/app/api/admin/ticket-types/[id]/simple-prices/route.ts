import { simplePricingSchema } from '@/lib/catalog';
import { requireApiAuth } from '@/server/auth/cookies';
import { saveSimplePricing } from '@/server/catalog/service';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';

export const PUT = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  return ok(await saveSimplePricing(auth, id, await readJson(req, simplePricingSchema), meta));
});
