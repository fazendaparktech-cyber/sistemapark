import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { AdminShell } from '@/components/admin/admin-shell';
import { navFor } from '@/components/admin/nav';
import { roleDefinition } from '@/lib/access';
import { requirePageAuth } from '@/server/auth/guards';
import { env } from '@/server/env';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // O proxy informa o caminho: sem sessão, a pessoa volta para esta mesma página depois do login.
  const caminho = (await headers()).get('x-pathname') ?? '/admin';
  const auth = await requirePageAuth({ next: caminho });

  return (
    <AdminShell
      nav={navFor(auth.permissions)}
      parkName={auth.park.name}
      salesUrl={`${env().APP_URL}/comprar`}
      timeZone={auth.park.timezone}
      canSearch={(['customers.view', 'orders.view', 'tickets.view'] as const).some((permissao) =>
        auth.permissions.has(permissao),
      )}
      user={{
        name: auth.user.name,
        email: auth.user.email,
        roleNames: auth.roles.map((papel) => roleDefinition(papel).name),
      }}
    >
      {children}
    </AdminShell>
  );
}
