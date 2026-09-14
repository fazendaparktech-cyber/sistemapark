import type { Metadata } from 'next';
import Link from 'next/link';

import { OrderLinksForm } from '@/components/site/order-links-form';

export const metadata: Metadata = {
  title: 'Meus ingressos',
  description: 'Receba de novo os links dos seus pedidos e ingressos do Conquista Park.',
};

export default function MeusIngressosPage() {
  return (
    <div className="bg-gradient-to-b from-pool-50 to-white">
      <div className="mx-auto max-w-xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.03em] text-ink-950 sm:text-[42px]">
          Meus ingressos
        </h1>
        <p className="mt-3 text-base leading-7 text-ink-600">
          O link do pedido chega por e-mail logo depois da compra. Se não encontrar, informe o e-mail usado na
          compra e enviamos os links de novo.
        </p>
        <div className="mt-8 rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink-200/70 sm:p-8">
          <OrderLinksForm />
        </div>
        <p className="mt-6 text-center text-sm text-ink-500">
          Ainda não comprou?{' '}
          <Link href="/comprar" className="font-semibold text-pool-700 hover:text-pool-800">
            Escolha a data da visita
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
