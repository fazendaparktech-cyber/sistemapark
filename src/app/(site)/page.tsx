import {
  Check,
  CalendarDays,
  ChevronRight,
  MapPin,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { Waves } from '@/components/brand/waves';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { addDays, todayIn, weekdayOf } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { formatDateLong, formatShortDate, WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import { isAppError } from '@/server/errors';
import { getPublicPark } from '@/server/parks/public';
import { getPublicCalendar, getPublicDateOffer, type PublicDateOffer } from '@/server/sales/availability';
import { getParkProfile } from '@/server/settings/service';

export const metadata: Metadata = {
  title: { absolute: 'Conquista Park · Parque aquático em Ubatã, Bahia' },
  description:
    'Toboáguas, piscinas e área infantil em Ubatã, Bahia. Compre o ingresso pelo site, pague com PIX e entre com o QR Code.',
};

const FOTOS = [
  { arquivo: 'toboaguas-coloridos', titulo: 'Toboáguas', classe: 'sm:col-span-2 sm:row-span-2' },
  { arquivo: 'area-infantil', titulo: 'Área infantil', classe: '' },
  { arquivo: 'piscinas-lago', titulo: 'Piscinas e lago', classe: '' },
  { arquivo: 'deck-guarda-sois', titulo: 'Deck com guarda-sóis', classe: '' },
  { arquivo: 'vista-geral', titulo: 'Vista geral do parque', classe: '' },
];

const PASSOS = [
  {
    icone: CalendarDays,
    titulo: 'Escolha a data e os ingressos',
    texto:
      'Veja os dias abertos, os horários e os preços. As vagas ficam reservadas enquanto você preenche os dados.',
  },
  {
    icone: ShieldCheck,
    titulo: 'Pague com PIX',
    texto: 'O pagamento é confirmado em instantes, sem precisar enviar comprovante.',
  },
  {
    icone: QrCode,
    titulo: 'Entre com o QR Code',
    texto:
      'Os ingressos aparecem na hora e chegam por e-mail. Na entrada, basta mostrar o QR Code no celular.',
  },
];

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function InicioPage() {
  const parque = await getPublicPark().catch((erro: unknown) => {
    if (isAppError(erro)) return null;
    throw erro;
  });

  let proximas: Awaited<ReturnType<typeof getPublicCalendar>> = [];
  let oferta: PublicDateOffer | null = null;
  let perfil = null;
  if (parque) {
    const hoje = todayIn(parque.timezone);
    [proximas, perfil] = await Promise.all([
      getPublicCalendar(parque, hoje, addDays(hoje, 45)),
      getParkProfile(parque.id),
    ]);
    proximas = proximas.filter((dia) => dia.status === 'AVAILABLE' || dia.status === 'FEW_LEFT');
    const primeira = proximas[0];
    if (primeira) oferta = await getPublicDateOffer(parque, primeira.date);
  }

  const precosPagos = (oferta?.ticketTypes ?? []).map((tipo) => tipo.priceCents).filter((preco) => preco > 0);
  const aPartirDe = precosPagos.length > 0 ? Math.min(...precosPagos) : null;
  const unico = oferta?.ticketTypes.length === 1 ? oferta.ticketTypes[0] : undefined;
  const cidade = perfil?.city ? `${perfil.city}${perfil.state ? ` - ${perfil.state}` : ''}` : null;
  const endereco = [perfil?.addressLine, cidade].filter(Boolean).join(', ');

  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink-950 text-white">
        <Image
          src="/photos/vista-geral-1280.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover opacity-70"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950/90 via-ink-950/60 to-ink-950/10"
        />
        <div className="mx-auto flex min-h-[560px] max-w-6xl flex-col justify-center px-4 py-20 sm:min-h-[620px] sm:px-6">
          <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-pool-300">
            Parque aquático · Ubatã, Bahia
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-[42px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[68px]">
            Um dia inteiro de água, sol e diversão em família.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-ink-100">
            Compre pelo site, pague com PIX e entre com o QR Code no celular. Sem fila na bilheteria.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/comprar" className={buttonClasses('cta', 'lg')}>
              Comprar ingressos
            </Link>
            <Link
              href="#ingressos"
              className="inline-flex h-12 items-center rounded-xl px-5 text-base font-semibold text-white ring-1 ring-inset ring-white/40 transition-colors hover:bg-white/10"
            >
              Ver preços
            </Link>
          </div>
          {aPartirDe !== null ? (
            <p className="mt-6 text-sm text-ink-200">
              Ingresso a partir de <span className="font-semibold text-white">{formatBRL(aPartirDe)}</span>
            </p>
          ) : null}
        </div>
      </section>

      {proximas.length > 0 ? (
        <section aria-labelledby="proximas-datas" className="border-b border-ink-100 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="proximas-datas" className="text-sm font-semibold text-ink-900">
                Próximas datas abertas
              </h2>
              <Link href="/comprar" className="text-sm font-semibold text-pool-700 hover:text-pool-800">
                Ver calendário
              </Link>
            </div>
            <ul className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
              {proximas.slice(0, 8).map((dia) => (
                <li key={dia.date}>
                  <Link
                    href={`/comprar?data=${dia.date}`}
                    className="flex min-w-24 flex-col items-center rounded-2xl bg-pool-50 px-4 py-3 text-center ring-1 ring-inset ring-pool-100 transition-colors hover:bg-pool-100"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-pool-700">
                      {WEEKDAY_SHORT_LABELS[weekdayOf(dia.date)]}
                    </span>
                    <span className="tabular font-display text-xl font-semibold text-ink-900">
                      {formatShortDate(dia.date)}
                    </span>
                    <span
                      className={cn(
                        'text-[11px]',
                        dia.status === 'FEW_LEFT' ? 'font-semibold text-sun-700' : 'text-ink-500',
                      )}
                    >
                      {dia.status === 'FEW_LEFT'
                        ? 'Últimas vagas'
                        : dia.fromPriceCents
                          ? `desde ${formatBRL(dia.fromPriceCents)}`
                          : 'Aberto'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="como-funciona" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2
            id="como-funciona"
            className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950 sm:text-4xl"
          >
            Como comprar
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {PASSOS.map((passo, indice) => (
              <li key={passo.titulo} className="rounded-3xl bg-canvas p-6 ring-1 ring-inset ring-ink-200/60">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-pool-700 text-white">
                    <passo.icone className="size-5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-pool-700">Passo {indice + 1}</span>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">{passo.titulo}</h3>
                <p className="mt-2 text-[15px] leading-7 text-ink-600">{passo.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="o-parque" className="bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2
            id="o-parque"
            className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950 sm:text-4xl"
          >
            O parque
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-ink-600">
            Toboáguas, piscinas, área infantil e espaço para descansar à sombra. Vagas limitadas por dia, para
            todo mundo aproveitar com conforto.
          </p>
          <div className="mt-8 grid auto-rows-[180px] gap-3 sm:grid-cols-4 sm:auto-rows-[190px]">
            {FOTOS.map((foto) => (
              <figure
                key={foto.arquivo}
                className={cn('group relative overflow-hidden rounded-3xl bg-ink-200', foto.classe)}
              >
                <Image
                  src={`/photos/${foto.arquivo}-${foto.classe ? '1280' : '800'}.webp`}
                  alt={foto.titulo}
                  fill
                  sizes={foto.classe ? '(min-width: 640px) 50vw, 100vw' : '(min-width: 640px) 25vw, 100vw'}
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/80 to-transparent px-4 pb-3 pt-10 text-sm font-semibold text-white">
                  {foto.titulo}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section
        id="ingressos"
        aria-labelledby="precos"
        className="relative scroll-mt-16 overflow-hidden bg-white"
      >
        <Waves className="absolute inset-x-0 bottom-0 -z-0 h-40 w-full text-pool-100" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="precos"
                className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950 sm:text-4xl"
              >
                {unico ? 'Ingresso' : 'Ingressos e preços'}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-ink-600">
                {unico
                  ? 'Valor único por pessoa, para todas as idades. Escolha a data da visita e pague com PIX.'
                  : oferta
                    ? `Valores para ${formatDateLong(oferta.date)}. Os preços podem variar entre dias úteis, fins de semana e feriados; o valor de cada data aparece no calendário de compra.`
                    : 'Os preços de cada data aparecem no calendário de compra.'}
              </p>
            </div>
            <Link href="/comprar" className={buttonClasses('cta', 'lg')}>
              Escolher data
            </Link>
          </div>
          {oferta && unico ? (
            <div className="mt-8 overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-ink-200/70">
              <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-ink-900">{unico.name}</h3>
                  {unico.description ? (
                    <p className="mt-2 max-w-xl text-[15px] leading-6 text-ink-600">{unico.description}</p>
                  ) : null}
                  <ul className="mt-5 grid gap-2.5 text-[15px] text-ink-700 sm:grid-cols-2">
                    {[
                      'Vale para a data escolhida na compra',
                      'Pagamento por PIX',
                      'Ingresso com QR Code no celular',
                      'Entrada direto na portaria',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2.5">
                        <Check className="size-4 shrink-0 text-pool-600" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-canvas p-6 text-center md:min-w-64">
                  {unico.compareAtCents ? (
                    <p className="tabular text-sm text-ink-400 line-through">
                      {formatBRL(unico.compareAtCents)}
                    </p>
                  ) : null}
                  <p className="tabular font-display text-5xl font-semibold tracking-[-0.02em] text-ink-950">
                    {formatBRL(unico.priceCents)}
                  </p>
                  <p className="mt-1 text-sm text-ink-500">por pessoa</p>
                  <Link
                    href={`/comprar?data=${oferta.date}`}
                    className={cn(buttonClasses('cta', 'lg'), 'mt-5 w-full')}
                  >
                    Comprar ingresso
                  </Link>
                </div>
              </div>
            </div>
          ) : oferta && oferta.ticketTypes.length > 0 ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {oferta.ticketTypes.map((tipo) => (
                <li
                  key={tipo.id}
                  className="flex flex-col rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink-200/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold text-ink-900">{tipo.name}</h3>
                    {tipo.peoplePerTicket > 1 ? (
                      <span className="rounded-full bg-grape-50 px-2.5 py-1 text-xs font-semibold text-grape-700">
                        {tipo.peoplePerTicket} pessoas
                      </span>
                    ) : null}
                  </div>
                  {tipo.description ? (
                    <p className="mt-2 text-[15px] leading-6 text-ink-600">{tipo.description}</p>
                  ) : null}
                  <div className="mt-auto pt-6">
                    {tipo.compareAtCents ? (
                      <p className="tabular text-sm text-ink-400 line-through">
                        {formatBRL(tipo.compareAtCents)}
                      </p>
                    ) : null}
                    <p className="tabular font-display text-3xl font-semibold text-ink-950">
                      {tipo.priceCents === 0 ? 'Gratuito' : formatBRL(tipo.priceCents)}
                    </p>
                    <Link
                      href={`/comprar?data=${oferta.date}`}
                      className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-pool-700 hover:text-pool-800"
                    >
                      Comprar para esta data
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 rounded-3xl bg-canvas px-6 py-8 text-center text-ink-600">
              Nenhuma data aberta para venda no momento. Acompanhe as novidades pelos canais do parque.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="duvidas" className="bg-canvas">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2
              id="duvidas"
              className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink-950 sm:text-4xl"
            >
              Dúvidas frequentes
            </h2>
            <p className="mt-3 text-base leading-7 text-ink-600">
              Não encontrou a resposta?{' '}
              <Link href="/contato" className="font-semibold text-pool-700 hover:text-pool-800">
                Fale com o parque
              </Link>
              .
            </p>
          </div>
          <div className="grid gap-3">
            {[
              {
                pergunta: 'Como recebo os ingressos?',
                resposta:
                  'Assim que o PIX é confirmado, os ingressos com QR Code aparecem na página do pedido e são enviados para o seu e-mail.',
              },
              {
                pergunta: 'Preciso imprimir?',
                resposta:
                  'Não. Mostre o QR Code no celular na entrada. Se preferir, a página do pedido também pode ser impressa.',
              },
              {
                pergunta: 'Cada pessoa precisa de um ingresso?',
                resposta:
                  'Sim, cada visitante usa o próprio QR Code, que vale para uma única entrada na data escolhida. As categorias e idades de cada ingresso aparecem na compra.',
              },
              {
                pergunta: 'Posso cancelar a compra?',
                resposta:
                  'Compras pelo site podem ser canceladas em até 7 dias da compra, desde que os ingressos não tenham sido usados. Veja a política de cancelamento.',
                link: { href: '/politicas/cancelamento', texto: 'Política de cancelamento' },
              },
              {
                pergunta: 'Perdi o e-mail com os ingressos',
                resposta:
                  'Informe o e-mail usado na compra em Meus ingressos e enviamos os links dos seus pedidos de novo.',
                link: { href: '/meus-ingressos', texto: 'Meus ingressos' },
              },
            ].map((item) => (
              <details
                key={item.pergunta}
                className="group rounded-2xl bg-white px-5 py-4 ring-1 ring-inset ring-ink-200/70"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink-900">
                  {item.pergunta}
                  <ChevronRight
                    className="size-4 shrink-0 text-ink-400 transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                </summary>
                <p className="mt-2 text-[15px] leading-7 text-ink-600">{item.resposta}</p>
                {item.link ? (
                  <Link
                    href={item.link.href}
                    className="mt-2 inline-block text-sm font-semibold text-pool-700 hover:text-pool-800"
                  >
                    {item.link.texto}
                  </Link>
                ) : null}
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-grape-700 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">Garanta a sua vaga</h2>
            <p className="mt-2 max-w-xl text-grape-100">
              {endereco ? (
                <span className="inline-flex items-start gap-2">
                  <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
                  {endereco}
                </span>
              ) : (
                'Vagas limitadas por dia. Compre com antecedência.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/comprar" className={buttonClasses('cta', 'lg')}>
              <Ticket className="size-5" aria-hidden />
              Comprar ingressos
            </Link>
            {perfil?.whatsapp ? (
              <a
                href={`https://wa.me/${perfil.whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-xl px-5 font-semibold ring-1 ring-inset ring-white/40 transition-colors hover:bg-white/10"
              >
                <MessageCircle className="size-5" aria-hidden />
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </section>
      {proximas.length === 0 && parque ? (
        <p className="sr-only">{capitalizar('nenhuma data aberta nos próximos 45 dias')}</p>
      ) : null}
    </>
  );
}
