import { clearSessionCookie, getAuth } from '@/server/auth/cookies';
import { logout } from '@/server/auth/service';
import { ok, route } from '@/server/http';

export const POST = route(async ({ meta }) => {
  const auth = await getAuth();
  if (auth) await logout(auth, meta);
  await clearSessionCookie();
  return ok({ loggedOut: true });
});
