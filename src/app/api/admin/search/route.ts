import { requireApiAuth } from '@/server/auth/cookies';
import { ok, route } from '@/server/http';
import { globalSearch } from '@/server/search/service';

/** Busca do topo do painel. */
export const GET = route(async ({ req }) => {
  const auth = await requireApiAuth();
  return ok(await globalSearch(auth, req.nextUrl.searchParams.get('q') ?? ''));
});
