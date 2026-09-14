import { customerUpdateSchema } from '@/lib/customers';
import { requireApiAuth } from '@/server/auth/cookies';
import { getCustomerDetail, updateCustomer } from '@/server/customers/service';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';

export const GET = route<IdRouteContext>(async ({ ctx }) => {
  const auth = await requireApiAuth();
  return ok(await getCustomerDetail(auth, await readIdParam(ctx)));
});

export const PUT = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const dados = await readJson(req, customerUpdateSchema);
  return ok(await updateCustomer(auth, id, dados, meta));
});
