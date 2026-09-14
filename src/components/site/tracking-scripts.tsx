import Script from 'next/script';

import type { MarketingSettings } from '@/lib/marketing';

/**
 * Código dos pixels configurados em Marketing, só nas páginas do site. Os IDs
 * passaram pela validação do formulário (só letras, números e hífen).
 */
export function TrackingScripts({ settings, nonce }: { settings: MarketingSettings; nonce?: string }) {
  const google = [settings.googleAnalyticsId, settings.googleAdsId].filter((id): id is string => Boolean(id));
  if (!settings.metaPixelId && !settings.tiktokPixelId && google.length === 0) return null;

  const texto = (valor: string) => JSON.stringify(valor);
  const partes: string[] = [];
  if (settings.metaPixelId) {
    partes.push(
      "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');",
      `fbq('init',${texto(settings.metaPixelId)});fbq('track','PageView');`,
    );
  }
  if (settings.tiktokPixelId) {
    partes.push(
      `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript";n.async=!0;n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load(${texto(settings.tiktokPixelId)});ttq.page()}(window,document,'ttq');`,
    );
  }
  if (google.length > 0) {
    partes.push(
      `window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};gtag('js',new Date());${google.map((id) => `gtag('config',${texto(id)});`).join('')}`,
    );
  }
  const conversao =
    settings.googleAdsId && settings.googleAdsPurchaseLabel
      ? `${settings.googleAdsId}/${settings.googleAdsPurchaseLabel}`
      : null;
  // Por último: sinaliza que fbq, ttq e gtag já existem.
  partes.push(`window.cpRastreio=${JSON.stringify({ googleAdsPurchase: conversao })};`);

  return (
    <>
      {google[0] ? (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(google[0])}`}
          strategy="afterInteractive"
          nonce={nonce}
        />
      ) : null}
      <Script
        id="pixels-de-marketing"
        strategy="afterInteractive"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: partes.join('\n') }}
      />
    </>
  );
}
