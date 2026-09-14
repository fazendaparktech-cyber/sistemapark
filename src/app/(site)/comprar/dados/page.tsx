import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CheckoutForm } from '@/components/site/checkout-form';
import { getPublicPark } from '@/server/parks/public';
import { getCartView } from '@/server/sales/cart';
import { readCartToken } from '@/server/sales/cart-cookie';

export const metadata: Metadata = {
  title: 'Dados da compra',
  robots: { index: false, follow: false },
};

export default async function DadosDaCompraPage() {
  const parque = await getPublicPark();
  const carrinho = await getCartView(parque.id, await readCartToken());
  if (!carrinho) redirect('/comprar?expirado=1');

  const disponiveis = carrinho.items.filter((item) => item.available);

  return (
    <div className="bg-gradient-to-b from-pool-50 to-white">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-grape-600">Passo 3 de 4</p>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-tight tracking-[-0.03em] text-ink-950 sm:text-[40px]">
          Dados da compra
        </h1>
        {carrinho.hasUnavailableItems ? (
          <p className="mt-4 rounded-2xl bg-warning-50 px-5 py-4 text-sm text-warning-800 ring-1 ring-inset ring-warning-600/25">
            Um dos ingressos escolhidos deixou de ser vendido para esta data. Altere a escolha antes de
            concluir.
          </p>
        ) : null}
        <div className="mt-8">
          <CheckoutForm
            cart={{
              date: carrinho.date,
              expiresAt: carrinho.expiresAt.toISOString(),
              opensAt: carrinho.day.opensAt,
              closesAt: carrinho.day.closesAt,
              subtotalCents: carrinho.subtotalCents,
              ticketsCount: carrinho.ticketsCount,
              items: disponiveis.map((item) => ({
                ticketTypeId: item.ticketTypeId,
                name: item.name,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                totalCents: item.totalCents,
                tickets: item.tickets,
                holder: item.holder,
                minAge: item.minAge,
                maxAge: item.maxAge,
                documentHint: item.documentHint,
                available: item.available,
              })),
            }}
          />
        </div>
      </div>
    </div>
  );
}
