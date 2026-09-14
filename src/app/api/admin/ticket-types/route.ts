import { ticketTypeInputSchema } from '@/lib/catalog';
import { requireApiAuth } from '@/server/auth/cookies';
import { createTicketType, listTicketTypesAdmin } from '@/server/catalog/service';
import { ok, readJson, route } from '@/server/http';

export const GET = route(async () => {
  const auth = await requireApiAuth();
  return ok(await listTicketTypesAdmin(auth));
});

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, ticketTypeInputSchema);
  return ok(await createTicketType(auth, dados, meta), { status: 201 });
});
