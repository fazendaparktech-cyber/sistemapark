import { salesSettingsSchema } from '@/lib/settings';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';
import { updateSalesSettings } from '@/server/settings/service';

export const PUT = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, salesSettingsSchema);
  return ok(await updateSalesSettings(auth, dados, meta));
});
