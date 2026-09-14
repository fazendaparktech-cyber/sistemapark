import { financeEntryInputSchema } from '@/lib/finance-entries';
import { requireApiAuth } from '@/server/auth/cookies';
import { deleteFinanceEntry, updateFinanceEntry } from '@/server/finance/entries';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';

export const PUT = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const dados = await readJson(req, financeEntryInputSchema);
  return ok(await updateFinanceEntry(auth, id, dados, meta));
});

export const DELETE = route<IdRouteContext>(async ({ ctx, meta }) => {
  const auth = await requireApiAuth();
  await deleteFinanceEntry(auth, await readIdParam(ctx), meta);
  return ok({ deleted: true });
});
