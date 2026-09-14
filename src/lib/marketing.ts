import { z } from 'zod';

import { attributionSchema, visitorIdSchema } from './orders';

/** Marketing: pixels de anúncio e análise, e o funil de compra do site. */

function idOpcional(formato: RegExp, mensagem: string, maiusculas = false) {
  return z
    .string()
    .trim()
    .nullish()
    .transform((valor) => (valor ? (maiusculas ? valor.toUpperCase() : valor) : null))
    .refine((valor) => valor === null || formato.test(valor), mensagem);
}

export const marketingSettingsSchema = z
  .strictObject({
    metaPixelId: idOpcional(/^\d{8,20}$/, 'O ID do Pixel da Meta tem só números.'),
    tiktokPixelId: idOpcional(
      /^[A-Z0-9]{15,25}$/,
      'O ID do Pixel do TikTok tem letras e números, como C4ABCDEFGH1234567890.',
      true,
    ),
    googleAnalyticsId: idOpcional(
      /^G-[A-Z0-9]{6,12}$/,
      'O ID do Google Analytics começa com G-, como G-ABC123DEF4.',
      true,
    ),
    googleAdsId: idOpcional(/^AW-\d{6,12}$/, 'O ID do Google Ads começa com AW-, como AW-123456789.', true),
    googleAdsPurchaseLabel: idOpcional(
      /^[A-Za-z0-9_-]{6,40}$/,
      'Rótulo inválido: copie do Google Ads o texto que vem depois da barra.',
    ),
  })
  .superRefine((valores, ctx) => {
    if (valores.googleAdsPurchaseLabel && !valores.googleAdsId) {
      ctx.addIssue({
        code: 'custom',
        path: ['googleAdsId'],
        message: 'Informe o ID do Google Ads para usar o rótulo de conversão.',
      });
    }
  });

export type MarketingSettingsInput = z.input<typeof marketingSettingsSchema>;
export type MarketingSettings = z.output<typeof marketingSettingsSchema>;

export const DEFAULT_MARKETING_SETTINGS: MarketingSettings = {
  metaPixelId: null,
  tiktokPixelId: null,
  googleAnalyticsId: null,
  googleAdsId: null,
  googleAdsPurchaseLabel: null,
};

export const MARKETING_INTEGRATIONS: readonly {
  key: keyof MarketingSettings;
  label: string;
  example: string;
  hint: string;
}[] = [
  {
    key: 'metaPixelId',
    label: 'Pixel da Meta (Facebook e Instagram)',
    example: '123456789012345',
    hint: 'No Gerenciador de Eventos da Meta, o ID do pixel (conjunto de dados).',
  },
  {
    key: 'tiktokPixelId',
    label: 'Pixel do TikTok',
    example: 'C4ABCDEFGH1234567890',
    hint: 'No TikTok Ads Manager, em Ferramentas > Eventos > Web.',
  },
  {
    key: 'googleAnalyticsId',
    label: 'Google Analytics 4',
    example: 'G-ABC123DEF4',
    hint: 'No Analytics, em Administrador > Fluxos de dados: o ID da métrica.',
  },
  {
    key: 'googleAdsId',
    label: 'Google Ads',
    example: 'AW-123456789',
    hint: 'Na tag do Google Ads, o ID que começa com AW-.',
  },
  {
    key: 'googleAdsPurchaseLabel',
    label: 'Rótulo da conversão de compra (Google Ads)',
    example: 'AbC-dEfGhIjK',
    hint: 'Na ação de conversão de compra, o texto depois da barra em send_to.',
  },
];

// ─── Funil ──────────────────────────────────────────────────────────────────

export const TRACKING_EVENT_TYPES = [
  'VIEW_TICKETS',
  'CHECKOUT_STARTED',
  'PAYMENT_STARTED',
  'PURCHASE',
] as const;
export type TrackingEventTypeKey = (typeof TRACKING_EVENT_TYPES)[number];

export const TRACKING_EVENT_LABELS: Readonly<Record<TrackingEventTypeKey, string>> = {
  VIEW_TICKETS: 'Visualização dos ingressos',
  CHECKOUT_STARTED: 'Início do checkout',
  PAYMENT_STARTED: 'Pagamento iniciado',
  PURCHASE: 'Compra realizada',
};

/**
 * Eventos que o navegador pode registrar. Pagamento iniciado e compra realizada
 * são gravados só pelo servidor, a partir do pedido, e não aceitam envio de fora.
 */
export const publicTrackingEventSchema = z.strictObject({
  type: z.enum(['VIEW_TICKETS', 'CHECKOUT_STARTED']),
  visitorId: visitorIdSchema,
  valueCents: z.number().int().min(0).max(100_000_000).nullish(),
  attribution: attributionSchema.nullish(),
});

export type PublicTrackingEventInput = z.input<typeof publicTrackingEventSchema>;
