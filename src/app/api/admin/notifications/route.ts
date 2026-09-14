import { requireApiAuth } from '@/server/auth/cookies';
import { ok, route } from '@/server/http';
import { listNotifications } from '@/server/notifications/service';

export const GET = route(async () => {
  const auth = await requireApiAuth();
  return ok(await listNotifications(auth));
});
