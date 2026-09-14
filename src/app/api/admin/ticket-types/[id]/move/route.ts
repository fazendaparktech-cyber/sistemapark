import { z } from '@/lib/validation';
import { requireApiAuth } from '@/server/auth/cookies';
import { listTicketTypesAdmin, moveTicketType } from '@/server/catalog/service';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';

const movimento = z.strictObject({ direction: z.enum(['up', 'down']) });

export const POST = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const { direction } = await readJson(req, movimento);
  await moveTicketType(auth, id, direction, meta);
  return ok(await listTicketTypesAdmin(auth));
});
