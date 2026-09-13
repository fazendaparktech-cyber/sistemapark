import type { Metadata } from 'next';
import Link from 'next/link';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Alert } from '@/components/ui/alert';
import { buttonClasses } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Criar nova senha',
  // O token vem na URL: a página não deve ser indexada nem mandar o endereço como referência.
  referrer: 'no-referrer',
};

export default async function RedefinirSenhaPage({ searchParams }: PageProps<'/redefinir-senha'>) {
  const { token } = await searchParams;

  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    return (
      <div className="grid gap-5">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-900">
          Link incompleto
        </h1>
        <Alert tone="warning">
          Abra o link direto do e-mail, sem cortar o endereço. Se ele já foi usado ou passou de 30 minutos,
          peça um novo.
        </Alert>
        <Link href="/recuperar-senha" className={buttonClasses('primary', 'lg', 'w-full')}>
          Pedir um novo link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
