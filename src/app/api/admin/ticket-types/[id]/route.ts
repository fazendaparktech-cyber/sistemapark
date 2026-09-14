import { ticketTypeInputSchema } from '@/lib/catalog';
import { requireApiAuth } from '@/server/auth/cookies';
import { getTicketTypeAdmin, updateTicketType } from '@/server/catalog/service';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';

export const GET = route<IdRouteContext>(async ({ ctx }) => {
  const auth = await requireApiAuth();
  return ok(await getTicketTypeAdmin(auth, await readIdParam(ctx)));
});

export const PUT = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const dados = await readJson(req, ticketTypeInputSchema);
  return ok(await updateTicketType(auth, id, dados, meta));
});
