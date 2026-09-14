import type { AttributionInput } from './orders';

/**
 * Rastreamento no navegador do cliente: origem da visita (UTM), identificador
 * anônimo do navegador, eventos do funil gravados no próprio sistema e eventos
 * dos pixels configurados em Marketing. Nenhum dado pessoal sai daqui.
 */

export const ATTRIBUTION_KEY = 'cp-origem';
const VISITANTE_KEY = 'cp-visitante';
const COMPRA_PENDENTE_KEY = 'cp-compra-pendente';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (...args: unknown[]) => void; page: () => void };
    gtag?: (...args: unknown[]) => void;
    /** Definido pelo código dos pixels depois de preparar fbq, ttq e gtag. */
    cpRastreio?: { googleAdsPurchase: string | null };
  }
}

/** Guarda de onde a pessoa veio (campanha ou site), na primeira página que ela abrir. */
export function rememberAttribution(): void {
  try {
    if (sessionStorage.getItem(ATTRIBUTION_KEY)) return;
    const url = new URL(window.location.href);
    const referrer =
      document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : null;
    const origem = {
      utmSource: url.searchParams.get('utm_source'),
      utmMedium: url.searchParams.get('utm_medium'),
      utmCampaign: url.searchParams.get('utm_campaign'),
      utmContent: url.searchParams.get('utm_content'),
      utmTerm: url.searchParams.get('utm_term'),
      referrer,
    };
    if (Object.values(origem).some(Boolean)) sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(origem));
  } catch {
    // Navegação privada pode bloquear o armazenamento: a compra segue sem a origem.
  }
}

export function readAttribution(): AttributionInput | null {
  try {
    const salvo = sessionStorage.getItem(ATTRIBUTION_KEY);
    return salvo ? (JSON.parse(salvo) as AttributionInput) : null;
  } catch {
    return null;
  }
}

/** Identificador aleatório deste navegador, para ligar os passos do funil. */
export function visitorId(): string | null {
  try {
    const salvo = localStorage.getItem(VISITANTE_KEY);
    if (salvo && /^[A-Za-z0-9-]{16,40}$/.test(salvo)) return salvo;
    const novo = crypto.randomUUID();
    localStorage.setItem(VISITANTE_KEY, novo);
    return novo;
  } catch {
    return null;
  }
}

/** Visualização dos ingressos e início do checkout, gravados no funil do painel. */
export function sendFunnelEvent(
  type: 'VIEW_TICKETS' | 'CHECKOUT_STARTED',
  valueCents: number | null = null,
): void {
  // A página pode disparar o evento antes do layout guardar a origem: guarda aqui também.
  rememberAttribution();
  const id = visitorId();
  if (!id) return;
  fetch('/api/public/tracking', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, visitorId: id, valueCents, attribution: readAttribution() }),
  })
    // Lê a resposta até o fim: corpo não lido segura a conexão aberta no navegador.
    .then((resposta) => resposta.text())
    .catch(() => undefined);
}

export type PixelEvent = 'ViewContent' | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase';

const EVENTO_TIKTOK: Readonly<Record<PixelEvent, string>> = {
  ViewContent: 'ViewContent',
  InitiateCheckout: 'InitiateCheckout',
  AddPaymentInfo: 'AddPaymentInfo',
  Purchase: 'CompletePayment',
};

const EVENTO_GOOGLE: Readonly<Record<PixelEvent, string>> = {
  ViewContent: 'view_item_list',
  InitiateCheckout: 'begin_checkout',
  AddPaymentInfo: 'add_payment_info',
  Purchase: 'purchase',
};

/** Envia o evento para os pixels carregados (Meta, TikTok, Google Analytics e Google Ads). */
export function trackPixel(
  evento: PixelEvent,
  dados: { valueCents?: number | null; quantity?: number | null; orderCode?: string | null } = {},
): void {
  try {
    const valor = typeof dados.valueCents === 'number' ? { value: dados.valueCents / 100 } : {};
    const comum = { currency: 'BRL', ...valor };
    const pedido = dados.orderCode ?? null;
    window.fbq?.(
      'track',
      evento,
      { ...comum, content_type: 'product', ...(dados.quantity ? { num_items: dados.quantity } : {}) },
      pedido ? { eventID: pedido } : {},
    );
    window.ttq?.track(
      EVENTO_TIKTOK[evento],
      { ...comum, content_type: 'product', ...(dados.quantity ? { quantity: dados.quantity } : {}) },
      pedido ? { event_id: pedido } : {},
    );
    window.gtag?.('event', EVENTO_GOOGLE[evento], {
      ...comum,
      ...(pedido ? { transaction_id: pedido } : {}),
    });
    const conversao = window.cpRastreio?.googleAdsPurchase;
    if (evento === 'Purchase' && conversao) {
      window.gtag?.('event', 'conversion', {
        send_to: conversao,
        ...comum,
        ...(pedido ? { transaction_id: pedido } : {}),
      });
    }
  } catch {
    // Pixel bloqueado por extensão do navegador: a compra segue normalmente.
  }
}

/** Roda a ação quando os pixels estiverem prontos; desiste depois de 10 s (sem pixel configurado). */
export function whenPixelsReady(acao: () => void): () => void {
  let tentativas = 0;
  let espera: ReturnType<typeof setTimeout> | undefined;
  const tentar = () => {
    if (window.cpRastreio) {
      acao();
      return;
    }
    tentativas += 1;
    if (tentativas < 40) espera = setTimeout(tentar, 250);
  };
  tentar();
  return () => clearTimeout(espera);
}

/** Marca o pedido feito neste navegador: a conversão de compra só dispara aqui. */
export function rememberPendingPurchase(code: string): void {
  try {
    localStorage.setItem(COMPRA_PENDENTE_KEY, code);
  } catch {
    // Sem armazenamento: a compra fica sem conversão nos pixels.
  }
}

/** `true` uma única vez para o pedido feito neste navegador. */
export function takePendingPurchase(code: string): boolean {
  try {
    if (localStorage.getItem(COMPRA_PENDENTE_KEY) !== code) return false;
    localStorage.removeItem(COMPRA_PENDENTE_KEY);
    return true;
  } catch {
    return false;
  }
}
