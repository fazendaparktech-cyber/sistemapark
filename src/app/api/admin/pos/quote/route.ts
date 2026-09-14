import { posQuoteSchema } from '@/lib/orders';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';
import { quotePosSale } from '@/server/sales/pos';

export const POST = route(async ({ req }) => {
  const auth = await requireApiAuth();
  return ok(await quotePosSale(auth, await readJson(req, posQuoteSchema)));
});
