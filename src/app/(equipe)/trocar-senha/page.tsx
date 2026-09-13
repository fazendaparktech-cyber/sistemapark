import type { Metadata } from 'next';

import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { requirePageAuth } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Trocar senha' };

export default async function TrocarSenhaPage() {
  const auth = await requirePageAuth({ next: '/trocar-senha', allowPasswordChange: true });
  return (
    <ChangePasswordForm
      mustChange={auth.user.mustChangePassword}
      name={auth.user.name}
      email={auth.user.email}
    />
  );
}
