import { checkinScanSchema } from '@/lib/tickets';
import { requireApiAuth } from '@/server/auth/cookies';
import { checkInByQr } from '@/server/checkin/service';
import { ok, readJson, route } from '@/server/http';

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  return ok(await checkInByQr(auth, await readJson(req, checkinScanSchema), meta));
});
