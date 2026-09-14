import { requireApiAuth } from '@/server/auth/cookies';
import { listCustomers } from '@/server/customers/service';
import { parseCustomerFilters, searchParamsOf } from '@/server/filters';
import { ok, route } from '@/server/http';

export const GET = route(async ({ req }) => {
  const auth = await requireApiAuth();
  return ok(await listCustomers(auth, parseCustomerFilters(searchParamsOf(req.nextUrl))));
});
