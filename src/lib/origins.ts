/**
 * Origem das vendas online. Vale primeiro a campanha (utm_source); sem ela, o
 * site de onde a pessoa chegou (referrer). Sem nenhum dos dois, ou vindo do
 * próprio site, é acesso direto.
 */

export const ORIGINS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'GOOGLE', 'WHATSAPP', 'DIRECT', 'OTHER'] as const;
export type OriginKey = (typeof ORIGINS)[number];

export const ORIGIN_LABELS: Readonly<Record<OriginKey, string>> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  GOOGLE: 'Google',
  WHATSAPP: 'WhatsApp',
  DIRECT: 'Direto',
  OTHER: 'Outros',
};

const REGRAS: readonly { origem: OriginKey; fonte: RegExp; dominio: RegExp }[] = [
  { origem: 'INSTAGRAM', fonte: /^(instagram.*|ig|insta)$/, dominio: /(^|\.)instagram\.com$/ },
  {
    origem: 'FACEBOOK',
    fonte: /^(facebook.*|fb|meta)$/,
    dominio: /(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/,
  },
  { origem: 'TIKTOK', fonte: /^(tiktok.*|tt)$/, dominio: /(^|\.)tiktok\.com$/ },
  {
    origem: 'GOOGLE',
    fonte: /^(google.*|adwords|gads|youtube.*)$/,
    dominio: /(^|\.)(google\.[a-z.]+|googleadservices\.com|youtube\.com)$/,
  },
  { origem: 'WHATSAPP', fonte: /^(whatsapp.*|wa|wpp|zap)$/, dominio: /(^|\.)(whatsapp\.com|wa\.me)$/ },
];

/** Domínio de um endereço, sem "www.". `null` se não for uma URL. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function originOf(input: {
  utmSource: string | null | undefined;
  referrerHost: string | null | undefined;
  /** Domínio do próprio site: quem navegou dentro dele conta como direto. */
  ownHost?: string | null;
}): OriginKey {
  const fonte = input.utmSource?.trim().toLowerCase();
  if (fonte) return REGRAS.find((regra) => regra.fonte.test(fonte))?.origem ?? 'OTHER';

  const dominio = input.referrerHost
    ?.trim()
    .toLowerCase()
    .replace(/^www\./, '');
  const proprio = input.ownHost?.toLowerCase().replace(/^www\./, '');
  if (!dominio || (proprio && dominio === proprio)) return 'DIRECT';
  return REGRAS.find((regra) => regra.dominio.test(dominio))?.origem ?? 'OTHER';
}
