import { operationsSettingsSchema } from '@/lib/settings';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';
import { updateOperationsSettings } from '@/server/settings/service';

export const PUT = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, operationsSettingsSchema);
  return ok(await updateOperationsSettings(auth, dados, meta));
});
