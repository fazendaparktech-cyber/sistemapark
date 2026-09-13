import { ROLE_KEYS } from '@/lib/access';
import { z } from '@/lib/validation';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';
import { setUserRoles } from '@/server/users/service';

const corpo = z.strictObject({
  roles: z.array(z.string().max(40)).min(1, 'Escolha ao menos um papel').max(ROLE_KEYS.length),
});

export const PUT = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const { roles } = await readJson(req, corpo);
  return ok(await setUserRoles(auth, id, roles, meta));
});
