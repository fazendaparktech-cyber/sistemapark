import { listRoles } from '@/server/access/service';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, route } from '@/server/http';

export const GET = route(async () => {
  const auth = await requireApiAuth();
  return ok(await listRoles(auth));
});
