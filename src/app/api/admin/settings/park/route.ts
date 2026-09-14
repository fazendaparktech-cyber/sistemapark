import { parkProfileSchema } from '@/lib/settings';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';
import { updateParkProfile } from '@/server/settings/service';

export const PUT = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, parkProfileSchema);
  return ok(await updateParkProfile(auth, dados, meta));
});
