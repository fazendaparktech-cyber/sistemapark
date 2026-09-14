import { checkinManualSchema } from '@/lib/tickets';
import { requireApiAuth } from '@/server/auth/cookies';
import { checkInManually } from '@/server/checkin/service';
import { ok, readJson, route } from '@/server/http';

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  return ok(await checkInManually(auth, await readJson(req, checkinManualSchema), meta));
});
