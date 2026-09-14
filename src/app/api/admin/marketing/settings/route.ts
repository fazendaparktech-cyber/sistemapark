import { marketingSettingsSchema } from '@/lib/marketing';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';
import { updateMarketingSettings } from '@/server/settings/service';

export const PUT = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, marketingSettingsSchema);
  return ok(await updateMarketingSettings(auth, dados, meta));
});
