import 'server-only';

import { cookies } from 'next/headers';

import { CART_COOKIE } from './cart';

/** Cookie do carrinho: só o token aleatório, inacessível ao JavaScript da página. */

const seguro = process.env.NODE_ENV === 'production';

export async function readCartToken(): Promise<string | null> {
  return (await cookies()).get(CART_COOKIE)?.value ?? null;
}

/** Só em Route Handlers (Server Components não gravam cookie). */
export async function setCartCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(CART_COOKIE, token, {
    httpOnly: true,
    secure: seguro,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearCartCookie(): Promise<void> {
  (await cookies()).set(CART_COOKIE, '', {
    httpOnly: true,
    secure: seguro,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
