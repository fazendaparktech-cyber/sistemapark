import { ALL_PERMISSIONS } from '@/lib/access';
import { z } from '@/lib/validation';
import { setRolePermissions } from '@/server/access/service';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';

interface KeyRouteContext {
  params: Promise<{ key: string }>;
}

const corpo = z.strictObject({
  permissions: z.array(z.string().max(60)).max(ALL_PERMISSIONS.length),
});

export const PUT = route<KeyRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const { key } = await ctx.params;
  const { permissions } = await readJson(req, corpo);
  return ok(await setRolePermissions(auth, { roleKey: key, permissions }, meta));
});
