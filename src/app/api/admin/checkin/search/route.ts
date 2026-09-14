import { requireApiAuth } from '@/server/auth/cookies';
import { searchCheckinTickets } from '@/server/checkin/service';
import { ok, route } from '@/server/http';

export const GET = route(async ({ req }) => {
  const auth = await requireApiAuth();
  return ok(await searchCheckinTickets(auth, req.nextUrl.searchParams.get('q') ?? ''));
});
