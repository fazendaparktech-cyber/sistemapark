import { requireApiAuth } from '@/server/auth/cookies';
import { parseOrderFilters, searchParamsOf } from '@/server/filters';
import { ok, route } from '@/server/http';
import { listOrders } from '@/server/orders/admin';

export const GET = route(async ({ req }) => {
  const auth = await requireApiAuth();
  return ok(await listOrders(auth, parseOrderFilters(searchParamsOf(req.nextUrl))));
});
