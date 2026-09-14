import { priceRuleInputSchema } from '@/lib/catalog';
import { requireApiAuth } from '@/server/auth/cookies';
import { deletePriceRule, updatePriceRule } from '@/server/catalog/service';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';

export const PUT = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const dados = await readJson(req, priceRuleInputSchema);
  return ok(await updatePriceRule(auth, id, dados, meta));
});

export const DELETE = route<IdRouteContext>(async ({ ctx, meta }) => {
  const auth = await requireApiAuth();
  return ok(await deletePriceRule(auth, await readIdParam(ctx), meta));
});
