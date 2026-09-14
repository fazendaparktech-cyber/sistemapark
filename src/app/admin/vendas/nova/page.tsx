import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { NoPermission } from '@/components/admin/no-permission';
import { PosSale } from '@/components/admin/pos/pos-sale';
import { PageHeader } from '@/components/ui/page-header';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getPosOffer } from '@/server/sales/pos';

export const metadata: Metadata = { title: 'Nova venda' };

export default async function NovaVendaPage() {
  const auth = await requirePageAuth();
  if (!can(auth, 'pos.sell')) return <NoPermission />;
  const oferta = await getPosOffer(auth, null);

  return (
    <div className="grid gap-6">
      {can(auth, 'orders.view') ? (
        <Link
          href="/admin/vendas"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Vendas
        </Link>
      ) : null}
      <PageHeader
        eyebrow="Bilheteria"
        title="Nova venda"
        description="Escolha a data e os ingressos, identifique o cliente e receba o pagamento. A lotação do dia é conferida na hora da venda."
      />
      <PosSale
        initialOffer={oferta}
        canSearchCustomers={can(auth, 'customers.view')}
        canViewOrders={can(auth, 'orders.view')}
        canResend={can(auth, 'orders.resend')}
      />
    </div>
  );
}
