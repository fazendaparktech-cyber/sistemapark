import { CalendarDays, Mail, MapPin, MessageCircle, Phone, Ticket } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import { addDays, todayIn, weekdayOf } from '@/lib/dates';
import { formatPhoneBR } from '@/lib/documents';
import { formatShortDate, WEEKDAY_LABELS } from '@/lib/weekdays';
import { getPublicPark } from '@/server/parks/public';
import { getPublicCalendar } from '@/server/sales/availability';
import { getParkProfile } from '@/server/settings/service';

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Endereço, WhatsApp, telefone e próximas datas abertas do Conquista Park.',
};

export default async function ContatoPage() {
  const parque = await getPublicPark();
  const hoje = todayIn(parque.timezone);
  const [perfil, calendario] = await Promise.all([
    getParkProfile(parque.id),
    getPublicCalendar(parque, hoje, addDays(hoje, 20)),
  ]);
  const abertos = calendario
    .filter((dia) => dia.status === 'AVAILABLE' || dia.status === 'FEW_LEFT')
    .slice(0, 6);
  const cidade = perfil.city ? `${perfil.city}${perfil.state ? ` - ${perfil.state}` : ''}` : null;
  const endereco = [perfil.addressLine, cidade].filter(Boolean).join(', ');
  const mapa = endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${perfil.name}, ${endereco}`)}`
    : null;

  const canais = [
    perfil.whatsapp
      ? {
          icone: MessageCircle,
          titulo: 'WhatsApp',
          valor: formatPhoneBR(perfil.whatsapp),
          href: `https://wa.me/${perfil.whatsapp}`,
          externo: true,
        }
      : null,
    perfil.phone
      ? {
          icone: Phone,
          titulo: 'Telefone',
          valor: formatPhoneBR(perfil.phone),
          href: `tel:+${perfil.phone}`,
          externo: false,
        }
      : null,
    perfil.email
      ? { icone: Mail, titulo: 'E-mail', valor: perfil.email, href: `mailto:${perfil.email}`, externo: false }
      : null,
  ].filter((canal) => canal !== null);

  return (
    <div className="bg-gradient-to-b from-pool-50 to-white">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.03em] text-ink-950 sm:text-[42px]">
          Contato
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-ink-600">
          Fale com o parque para tirar dúvidas sobre ingressos, pedidos e a sua visita. Tenha em mãos o número
          do pedido, se já comprou.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="grid gap-4 sm:grid-cols-2">
            {canais.map((canal) => (
              <a
                key={canal.titulo}
                href={canal.href}
                target={canal.externo ? '_blank' : undefined}
                rel={canal.externo ? 'noreferrer' : undefined}
                className="flex items-start gap-4 rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 transition-colors hover:bg-pool-50/40"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pool-50 text-pool-700 ring-1 ring-pool-100">
                  <canal.icone className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-500">{canal.titulo}</span>
                  <span className="block break-all font-semibold text-ink-900">{canal.valor}</span>
                </span>
              </a>
            ))}
            {endereco ? (
              <div className="flex items-start gap-4 rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 sm:col-span-2">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-grape-50 text-grape-600 ring-1 ring-grape-100">
                  <MapPin className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-500">Endereço</span>
                  <span className="block font-semibold text-ink-900">{endereco}</span>
                  {mapa ? (
                    <a
                      href={mapa}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-sm font-semibold text-pool-700 hover:text-pool-800"
                    >
                      Abrir no mapa
                    </a>
                  ) : null}
                </span>
              </div>
            ) : null}
            {canais.length === 0 && !endereco ? (
              <p className="rounded-3xl bg-white p-5 text-ink-600 shadow-card ring-1 ring-ink-200/70 sm:col-span-2">
                Os canais de atendimento ainda não foram informados.
              </p>
            ) : null}
          </div>

          <section
            aria-labelledby="proximos-dias"
            className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink-200/70"
          >
            <h2
              id="proximos-dias"
              className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900"
            >
              <CalendarDays className="size-5 text-pool-700" aria-hidden />
              Próximos dias abertos
            </h2>
            {abertos.length > 0 ? (
              <ul className="mt-4 divide-y divide-ink-100">
                {abertos.map((dia) => (
                  <li key={dia.date} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="font-medium text-ink-900">
                      {WEEKDAY_LABELS[weekdayOf(dia.date)]}, {formatShortDate(dia.date)}
                      {dia.label ? (
                        <span className="block text-xs font-normal text-grape-700">{dia.label}</span>
                      ) : null}
                    </span>
                    <span className="tabular text-ink-600">
                      {dia.opensAt && dia.closesAt ? `${dia.opensAt} às ${dia.closesAt}` : 'Aberto'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-ink-600">Nenhum dia aberto para venda nas próximas semanas.</p>
            )}
            <div className="mt-5 grid gap-2">
              <Link href="/comprar" className={buttonClasses('cta', 'lg', 'w-full')}>
                <Ticket className="size-5" aria-hidden />
                Comprar ingressos
              </Link>
              <Link href="/meus-ingressos" className={buttonClasses('secondary', 'lg', 'w-full')}>
                Receber meus ingressos
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
