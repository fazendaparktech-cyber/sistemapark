import { posSaleSchema } from '@/lib/orders';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';
import { placePosOrder } from '@/server/sales/pos';

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  return ok(await placePosOrder(auth, await readJson(req, posSaleSchema), meta), { status: 201 });
});
