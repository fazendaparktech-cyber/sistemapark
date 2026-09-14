import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';
import { markNotificationsRead, markNotificationsReadSchema } from '@/server/notifications/service';

export const POST = route(async ({ req }) => {
  const auth = await requireApiAuth();
  return ok(await markNotificationsRead(auth, await readJson(req, markNotificationsReadSchema)));
});
