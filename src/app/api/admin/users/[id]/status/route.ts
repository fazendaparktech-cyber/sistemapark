import { z } from '@/lib/validation';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';
import { setUserStatus } from '@/server/users/service';

const corpo = z.strictObject({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED'], { error: 'Situação inválida' }),
});

export const PUT = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const { status } = await readJson(req, corpo);
  return ok(await setUserStatus(auth, id, status, meta));
});
