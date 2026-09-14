import { policiesSchema } from '@/lib/settings';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';
import { updatePolicies } from '@/server/settings/service';

export const PUT = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, policiesSchema);
  return ok(await updatePolicies(auth, dados, meta));
});
