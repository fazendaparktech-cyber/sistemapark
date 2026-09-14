/**
 * Acesso à página do pedido. O link enviado ao cliente leva o token em `?t=`;
 * no primeiro acesso o token passa para um cookie restrito àquele pedido e sai
 * da URL, para não ficar no histórico nem ir para os pixels de anúncio, que
 * registram o endereço da página.
 */

export const ORDER_ACCESS_COOKIE = 'cp_pedido';

const VALIDADE_EM_SEGUNDOS = 60 * 60 * 24 * 120;
const CODIGO = /^[A-Za-z0-9-]{1,40}$/;

/** Caminho da página do pedido; `null` para código fora do formato. */
export function orderPagePath(code: string): string | null {
  return CODIGO.test(code) ? `/pedido/${code}` : null;
}

export function orderAccessCookieOptions(path: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path,
    maxAge: VALIDADE_EM_SEGUNDOS,
  };
}
