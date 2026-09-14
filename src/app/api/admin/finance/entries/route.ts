import { financeEntryInputSchema } from '@/lib/finance-entries';
import { requireApiAuth } from '@/server/auth/cookies';
import { createFinanceEntry } from '@/server/finance/entries';
import { ok, readJson, route } from '@/server/http';

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, financeEntryInputSchema);
  return ok(await createFinanceEntry(auth, dados, meta), { status: 201 });
});
