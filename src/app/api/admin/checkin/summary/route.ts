import { requireApiAuth } from '@/server/auth/cookies';
import { getCheckinSummary } from '@/server/checkin/service';
import { ok, route } from '@/server/http';

export const GET = route(async () => {
  const auth = await requireApiAuth();
  return ok(await getCheckinSummary(auth));
});
