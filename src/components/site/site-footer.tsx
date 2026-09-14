import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';

import { formatPhoneBR } from '@/lib/documents';
import type { ParkProfile } from '@/lib/settings';

import { Logo } from '../brand/logo';

function formatarCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

const LINK = 'text-sm text-ink-300 transition-colors hover:text-white';

export function SiteFooter({ profile, year }: { profile: ParkProfile | null; year: string }) {
  const cidade = profile?.city ? `${profile.city}${profile.state ? ` - ${profile.state}` : ''}` : null;

  return (
    <footer className="bg-ink-950 text-white print:hidden">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="grid content-start gap-4">
          <Logo light className="h-10" />
          <p className="max-w-xs text-sm leading-6 text-ink-300">
            Parque aquático para passar o dia em família. Compre o ingresso pelo site e entre com o QR Code no
            celular.
          </p>
        </div>

        <div className="grid content-start gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">Visite</p>
          {profile?.addressLine || cidade ? (
            <p className="flex gap-2 text-sm leading-6 text-ink-300">
              <MapPin className="mt-1 size-4 shrink-0 text-pool-400" aria-hidden />
              <span>
                {profile?.addressLine ? (
                  <>
                    {profile.addressLine}
                    <br />
                  </>
                ) : null}
                {cidade}
                {profile?.postalCode
                  ? ` · CEP ${profile.postalCode.replace(/^(\d{5})(\d{3})$/, '$1-$2')}`
                  : ''}
              </span>
            </p>
          ) : null}
          <Link href="/comprar" className={LINK}>
            Datas e horários
          </Link>
        </div>

        <div className="grid content-start gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">Atendimento</p>
          {profile?.whatsapp ? (
            <a
              href={`https://wa.me/${profile.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className={`${LINK} flex items-center gap-2`}
            >
              <MessageCircle className="size-4 text-citrus-400" aria-hidden />
              WhatsApp {formatPhoneBR(profile.whatsapp)}
            </a>
          ) : null}
          {profile?.phone ? (
            <a href={`tel:+${profile.phone}`} className={`${LINK} flex items-center gap-2`}>
              <Phone className="size-4 text-pool-400" aria-hidden />
              {formatPhoneBR(profile.phone)}
            </a>
          ) : null}
          {profile?.email ? (
            <a href={`mailto:${profile.email}`} className={`${LINK} flex items-center gap-2 break-all`}>
              <Mail className="size-4 shrink-0 text-pool-400" aria-hidden />
              {profile.email}
            </a>
          ) : null}
          <Link href="/meus-ingressos" className={LINK}>
            Meus ingressos
          </Link>
        </div>

        <div className="grid content-start gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">Informações</p>
          <Link href="/politicas/cancelamento" className={LINK}>
            Cancelamento e reembolso
          </Link>
          <Link href="/politicas/termos" className={LINK}>
            Termos de compra
          </Link>
          <Link href="/politicas/privacidade" className={LINK}>
            Privacidade
          </Link>
          <Link href="/contato" className={LINK}>
            Contato
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {year} {profile?.legalName ?? profile?.name ?? 'Conquista Park'}
            {profile?.cnpj ? ` · CNPJ ${formatarCnpj(profile.cnpj)}` : ''}
          </p>
          <Link href="/entrar" className="w-fit transition-colors hover:text-white">
            Área da equipe
          </Link>
        </div>
      </div>
    </footer>
  );
}
