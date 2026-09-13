import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { Errors } from '../errors';
import type { AuthContext } from './context';
import { resolveSession } from './session';

/**
 * Cookie de sessão. Em produção usa o prefixo `__Host-`, que obriga HTTPS,
 * caminho "/" e nenhum domínio — o cookie não vaza para subdomínios.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-cp_session' : 'cp_session';

const seguro = process.env.NODE_ENV === 'production';

/** Só em Route Handlers e Server Actions (Server Components não gravam cookie). */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: seguro,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: seguro,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** Sessão da requisição atual, lida uma vez por renderização. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  return resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
});

/** Para Route Handlers: 401 sem sessão; 403 se a senha precisa ser trocada antes. */
export async function requireApiAuth(options: { allowPasswordChange?: boolean } = {}): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw Errors.unauthenticated();
  if (auth.user.mustChangePassword && !options.allowPasswordChange) throw Errors.passwordChangeRequired();
  return auth;
}
