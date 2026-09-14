import { parkLogoSchema } from '@/lib/settings';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, route } from '@/server/http';
import { removeParkLogo, updateParkLogo } from '@/server/settings/service';

export const PUT = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, parkLogoSchema);
  return ok(await updateParkLogo(auth, dados, meta));
});

export const DELETE = route(async ({ meta }) => {
  const auth = await requireApiAuth();
  await removeParkLogo(auth, meta);
  return ok({ removed: true });
});
