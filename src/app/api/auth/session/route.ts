import { requireApiAuth } from '@/server/auth/cookies';
import { ok, route } from '@/server/http';

export const GET = route(async () => {
  const auth = await requireApiAuth({ allowPasswordChange: true });
  return ok({
    user: auth.user,
    park: auth.park,
    roles: auth.roles,
    permissions: [...auth.permissions].sort(),
  });
});
