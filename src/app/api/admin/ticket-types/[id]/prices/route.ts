import { priceRuleInputSchema } from '@/lib/catalog';
import { requireApiAuth } from '@/server/auth/cookies';
import { createPriceRule } from '@/server/catalog/service';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';

export const POST = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const dados = await readJson(req, priceRuleInputSchema);
  return ok(await createPriceRule(auth, id, dados, meta), { status: 201 });
});
