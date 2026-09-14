import { customerCreateSchema } from '@/lib/customers';
import { requireApiAuth } from '@/server/auth/cookies';
import { createCustomer, listCustomers } from '@/server/customers/service';
import { parseCustomerFilters, searchParamsOf } from '@/server/filters';
import { ok, readJson, route } from '@/server/http';

export const GET = route(async ({ req }) => {
  const auth = await requireApiAuth();
  return ok(await listCustomers(auth, parseCustomerFilters(searchParamsOf(req.nextUrl))));
});

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  return ok(await createCustomer(auth, await readJson(req, customerCreateSchema), meta), { status: 201 });
});
