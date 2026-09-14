import { z } from '@/lib/validation';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';
import { simulatePosPix } from '@/server/sales/pos';

const schema = z.strictObject({ outcome: z.enum(['APPROVED', 'DECLINED']) });

export const POST = route<IdRouteContext>(async ({ req, ctx }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const { outcome } = await readJson(req, schema);
  return ok(await simulatePosPix(auth, id, outcome));
});
