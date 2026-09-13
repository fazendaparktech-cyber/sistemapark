import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/login-form';
import { getAuth } from '@/server/auth/cookies';
import { safeNextPath } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Entrar' };

export default async function EntrarPage({ searchParams }: PageProps<'/entrar'>) {
  const parametros = await searchParams;
  const destino = safeNextPath(typeof parametros.next === 'string' ? parametros.next : null);

  const auth = await getAuth();
  if (auth) redirect(auth.user.mustChangePassword ? '/trocar-senha' : destino);

  const aviso =
    typeof parametros.next === 'string' ? 'Entre novamente para continuar de onde parou.' : undefined;
  return <LoginForm next={destino} notice={aviso} />;
}
