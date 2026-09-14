import { CircleCheck, CircleX, Clock, MapPin, MessageCircle, TicketCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PaymentPanel, PrintButton } from '@/components/site/payment-panel';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { formatDateTimeBR } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { TICKET_STATUS_LABELS } from '@/lib/orders';
import type { SearchParamsRecord } from '@/server/filters';
import { getPublicOrder } from '@/server/orders/public';
import { getPublicPark } from '@/server/parks/public';
import { getParkProfile } from '@/server/settings/service';

export const metadata: Metadata = {
  title: 'Seu pedido',
  robots: { index: false, follow: false },
};

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function PedidoPublicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ code }, parametros, parque] = await Promise.all([params, searchParams, getPublicPark()]);
  const token = typeof parametros.t === 'string' ? parametros.t : null;
  const pedido = await getPublicOrder(parque.id, decodeURIComponent(code), token);

  if (!pedido) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-ink-950">Pedido não encontrado</h1>
        <p className="mt-3 text-ink-600">
          Confira se abriu o link completo enviado por e-mail. Se precisar, peça os links dos seus pedidos de
          novo.
        </p>
        <Link href="/meus-ingressos" className={buttonClasses('cta', 'lg', 'mt-8')}>
          Receber meus ingressos por e-mail
        </Link>
      </div>
    );
  }

  const perfil = await getParkProfile(parque.id);
  const fuso = parque.timezone;
  const validos = pedido.tickets.filter(
    (ingresso) => ingresso.status === 'ACTIVE' || ingresso.status === 'CHECKED_IN',
  );

  const cabecalho = {
    PENDING_PAYMENT: {
      icone: Clock,
      tom: 'bg-sun-50 text-sun-700 ring-sun-200',
      titulo: 'Falta pouco: pague o PIX',
      texto: `Pedido ${pedido.code} reservado. Pague para garantir os ingressos.`,
    },
    CONFIRMED: {
      icone: CircleCheck,
      tom: 'bg-success-50 text-success-700 ring-success-600/20',
      titulo: 'Pedido confirmado',
      texto: pedido.buyerEmailMasked
        ? `Seus ingressos estão abaixo e também foram enviados para ${pedido.buyerEmailMasked}.`
        : 'Seus ingressos estão abaixo.',
    },
    EXPIRED: {
      icone: Clock,
      tom: 'bg-ink-100 text-ink-600 ring-ink-200',
      titulo: pedido.needsRefund ? 'Pagamento recebido fora do prazo' : 'O prazo de pagamento terminou',
      texto: pedido.needsRefund
        ? 'O pagamento chegou depois que as vagas foram liberadas. O parque vai devolver o valor pelo mesmo meio de pagamento.'
        : 'As vagas foram liberadas. Você pode fazer um novo pedido.',
    },
    CANCELLED: {
      icone: CircleX,
      tom: 'bg-danger-50 text-danger-700 ring-danger-600/20',
      titulo: pedido.financialStatus === 'REFUNDED' ? 'Pedido cancelado e reembolsado' : 'Pedido cancelado',
      texto:
        pedido.financialStatus === 'REFUNDED'
          ? 'O valor foi devolvido pelo mesmo meio de pagamento. O prazo para aparecer depende do seu banco.'
          : 'Os ingressos deste pedido não valem mais.',
    },
  }[pedido.status];

  return (
    <div className="bg-gradient-to-b from-pool-50 to-white print:bg-white">
      <div className="mx-auto grid max-w-4xl gap-6 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span
            className={cn(
              'grid size-14 shrink-0 place-items-center rounded-2xl ring-1 ring-inset',
              cabecalho.tom,
            )}
          >
            <cabecalho.icone className="size-7" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.03em] text-ink-950 sm:text-[36px]">
              {cabecalho.titulo}
            </h1>
            <p className="mt-1 text-ink-600">{cabecalho.texto}</p>
          </div>
          {pedido.status === 'CONFIRMED' ? <PrintButton /> : null}
        </header>

        {pedido.status === 'PENDING_PAYMENT' ? (
          <section
            aria-label="Pagamento"
            className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 sm:p-7"
          >
            <PaymentPanel
              code={pedido.code}
              token={token ?? ''}
              expiresAt={pedido.expiresAt?.toISOString() ?? null}
              pixPayload={pedido.payment?.pixPayload ?? null}
              qrSvg={pedido.payment?.qrSvg ?? null}
              totalLabel={formatBRL(pedido.totalCents)}
              canSimulate={pedido.canSimulatePayment}
            />
          </section>
        ) : null}

        {pedido.status === 'EXPIRED' ||
        (pedido.status === 'CANCELLED' && pedido.financialStatus !== 'REFUNDED') ? (
          <div>
            <Link href="/comprar" className={buttonClasses('cta', 'lg')}>
              Fazer um novo pedido
            </Link>
          </div>
        ) : null}

        {pedido.status === 'CONFIRMED' ? (
          <section aria-labelledby="seus-ingressos" className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="seus-ingressos" className="font-display text-xl font-semibold text-ink-900">
                Seus ingressos
              </h2>
              <p className="text-sm text-ink-500">Cada QR Code libera uma entrada. Não compartilhe.</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {validos.map((ingresso) => (
                <li
                  key={ingresso.code}
                  className="flex break-inside-avoid flex-col items-center rounded-3xl bg-white p-5 text-center shadow-card ring-1 ring-ink-200/70"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-grape-600">
                    {parque.name}
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold text-ink-900">
                    {ingresso.holderName ?? 'Visitante'}
                  </p>
                  <p className="text-sm text-ink-500">{ingresso.typeName}</p>
                  {ingresso.qrSvg ? (
                    <div
                      className="mt-4 w-full max-w-56 [&_svg]:h-auto [&_svg]:w-full"
                      role="img"
                      aria-label={`QR Code do ingresso ${ingresso.code}`}
                      dangerouslySetInnerHTML={{ __html: ingresso.qrSvg }}
                    />
                  ) : (
                    <div className="mt-4 grid aspect-square w-full max-w-56 place-items-center rounded-2xl bg-ink-50 text-ink-500">
                      <span className="flex flex-col items-center gap-2 text-sm">
                        <TicketCheck className="size-8" aria-hidden />
                        {ingresso.checkedInAt
                          ? `Entrada registrada em ${formatDateTimeBR(ingresso.checkedInAt, fuso)}`
                          : TICKET_STATUS_LABELS[ingresso.status]}
                      </span>
                    </div>
                  )}
                  <p className="mt-3 font-mono text-sm tracking-[0.2em] text-ink-700">{ingresso.code}</p>
                  <p className="mt-1 text-xs text-ink-500">{capitalizar(pedido.visitDateLong)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section
            aria-labelledby="resumo-do-pedido"
            className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 sm:p-6"
          >
            <h2 id="resumo-do-pedido" className="font-display text-lg font-semibold text-ink-900">
              Pedido {pedido.code}
            </h2>
            <p className="mt-1 text-sm text-ink-500">Feito em {formatDateTimeBR(pedido.createdAt, fuso)}</p>
            <ul className="mt-4 grid gap-2 text-sm">
              {pedido.items.map((item) => (
                <li key={item.name} className="flex justify-between gap-3">
                  <span className="text-ink-700">
                    {item.quantity} × {item.name}
                  </span>
                  <span className="tabular font-medium text-ink-900">
                    {formatBRL(item.totalCents + item.discountCents)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid gap-1.5 border-t border-ink-100 pt-4 text-sm">
              {pedido.discountCents > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-ink-500">
                    Desconto{pedido.couponCode ? ` (${pedido.couponCode})` : ''}
                  </dt>
                  <dd className="tabular text-grape-700">-{formatBRL(pedido.discountCents)}</dd>
                </div>
              ) : null}
              <div className="flex items-end justify-between">
                <dt className="font-semibold text-ink-900">Total</dt>
                <dd className="tabular font-display text-2xl font-semibold text-ink-900">
                  {formatBRL(pedido.totalCents)}
                </dd>
              </div>
            </dl>
          </section>

          <section
            aria-labelledby="sua-visita"
            className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 sm:p-6"
          >
            <h2 id="sua-visita" className="font-display text-lg font-semibold text-ink-900">
              Sua visita
            </h2>
            <p className="mt-2 font-semibold text-ink-900">{capitalizar(pedido.visitDateLong)}</p>
            <p className="text-sm text-ink-500">
              {pedido.day.opensAt && pedido.day.closesAt
                ? `Das ${pedido.day.opensAt} às ${pedido.day.closesAt}`
                : 'Horário do parque'}
              {pedido.day.label ? ` · ${pedido.day.label}` : ''}
            </p>
            {perfil.addressLine || perfil.city ? (
              <p className="mt-4 flex gap-2 text-sm leading-6 text-ink-600">
                <MapPin className="mt-1 size-4 shrink-0 text-pool-600" aria-hidden />
                <span>
                  {[
                    perfil.addressLine,
                    perfil.city && perfil.state ? `${perfil.city} - ${perfil.state}` : perfil.city,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </p>
            ) : null}
            {perfil.whatsapp ? (
              <a
                href={`https://wa.me/${perfil.whatsapp}?text=${encodeURIComponent(`Olá! Tenho uma dúvida sobre o pedido ${pedido.code}.`)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-success-700 hover:text-success-800 print:hidden"
              >
                <MessageCircle className="size-4" aria-hidden />
                Falar com o parque pelo WhatsApp
              </a>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
