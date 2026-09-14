import { isDateOnly } from '@/lib/dates';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, route } from '@/server/http';
import { getPosOffer } from '@/server/sales/pos';

export const GET = route(async ({ req }) => {
  const auth = await requireApiAuth();
  const data = req.nextUrl.searchParams.get('data');
  return ok(await getPosOffer(auth, data && isDateOnly(data) ? data : null));
});
