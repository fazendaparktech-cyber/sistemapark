import type { Metadata } from 'next';

import { PurchaseFlow } from '@/components/site/purchase-flow';
import { isDateOnly, todayIn } from '@/lib/dates';
import { prisma } from '@/server/db';
import type { SearchParamsRecord } from '@/server/filters';
import { getPublicPark } from '@/server/parks/public';
import { getSalesSettings } from '@/server/settings/service';

export const metadata: Metadata = {
  title: 'Comprar ingressos',
  description: 'Escolha a data, os ingressos e pague com PIX. O QR Code chega na hora.',
};

function texto(valor: string | string[] | undefined): string | null {
  const primeiro = Array.isArray(valor) ? valor[0] : valor;
  return primeiro?.trim() ? primeiro.trim() : null;
}

export default async function ComprarPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const parque = await getPublicPark();
  const [config, parametros] = await Promise.all([getSalesSettings(parque.id), searchParams]);
  const hoje = todayIn(parque.timezone);

  const dataPedida = texto(parametros.data);
  const dataInicial = dataPedida && isDateOnly(dataPedida) && dataPedida >= hoje ? dataPedida : null;
  const slug = texto(parametros.ingresso)?.slice(0, 60) ?? null;
  const tipoInicial = slug
    ? await prisma.ticketType.findUnique({
        where: { parkId_slug: { parkId: parque.id, slug } },
        select: { id: true },
      })
    : null;
  const aviso =
    texto(parametros.expirado) === '1'
      ? 'O tempo para concluir a compra acabou e as vagas foram liberadas. Escolha os ingressos de novo.'
      : null;

  return (
    <div className="bg-gradient-to-b from-pool-50 to-white">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-grape-600">{parque.name}</p>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-tight tracking-[-0.03em] text-ink-950 sm:text-[44px]">
          Comprar ingressos
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-ink-600">
          Escolha o dia da visita e quantos ingressos. As vagas ficam reservadas enquanto você preenche os
          dados, e o QR Code chega assim que o PIX é pago.
        </p>
        {!config.onlineSalesEnabled ? (
          <p className="mt-6 rounded-2xl bg-warning-50 px-5 py-4 text-sm font-medium text-warning-800 ring-1 ring-inset ring-warning-600/25">
            As vendas pelo site estão pausadas no momento. Tente novamente mais tarde ou fale com o parque.
          </p>
        ) : null}
        <div className="mt-8">
          <PurchaseFlow
            today={hoje}
            maxDaysAhead={config.maxDaysAhead}
            initialDate={dataInicial}
            initialTicketTypeId={tipoInicial?.id ?? null}
            notice={aviso}
          />
        </div>
      </div>
    </div>
  );
}
