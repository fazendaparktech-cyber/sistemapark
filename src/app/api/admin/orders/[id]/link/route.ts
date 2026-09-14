import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, route, type IdRouteContext } from '@/server/http';
import { regenerateOrderLink } from '@/server/orders/admin';

/** Gera um novo link para o cliente e invalida o anterior. */
export const POST = route<IdRouteContext>(async ({ ctx, meta }) => {
  const auth = await requireApiAuth();
  return ok(await regenerateOrderLink(auth, await readIdParam(ctx), meta));
});
