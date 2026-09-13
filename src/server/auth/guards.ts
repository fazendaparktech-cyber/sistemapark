import 'server-only';

import { redirect } from 'next/navigation';

import type { AuthContext } from './context';
import { getAuth } from './cookies';

/**
 * Para páginas do painel: sem sessão vai para o login (voltando depois para a
 * página pedida); com troca de senha pendente vai para a troca de senha.
 * A permissão de cada página é conferida na própria página, com `can`.
 */
export async function requirePageAuth(
  options: { next?: string; allowPasswordChange?: boolean } = {},
): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) {
    redirect(options.next ? `/entrar?next=${encodeURIComponent(options.next)}` : '/entrar');
  }
  if (auth.user.mustChangePassword && !options.allowPasswordChange) {
    redirect('/trocar-senha');
  }
  return auth;
}

/** Aceita só caminhos internos do painel como destino pós-login (evita redirecionamento aberto). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/admin';
  if (!next.startsWith('/admin')) return '/admin';
  return next;
}
