import 'server-only';

import { z } from '@/lib/validation';

/**
 * Variáveis de ambiente, validadas uma única vez. O sistema não sobe com
 * configuração inválida (ver `src/instrumentation.ts`). Segredos só existem em
 * variáveis de ambiente — nunca no código nem no repositório.
 */

const CHAVES_OBRIGATORIAS_EM_PRODUCAO = [
  'QR_SIGNING_KEY',
  'ORDER_LINK_KEY',
  'CPF_HASH_KEY',
  'CRON_SECRET',
] as const;

const chave = z.string().min(32, 'use pelo menos 32 caracteres').optional();

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z
      .url({ error: 'use a URL completa, ex.: https://ingressos.conquistapark.com.br' })
      .default('http://localhost:3000'),
    /** Parque vendido pelo site público desta instalação. */
    PARK_SLUG: z
      .string()
      .regex(/^[a-z0-9-]{2,60}$/, 'use letras minúsculas, números e hífen')
      .default('conquista-park'),
    DATABASE_URL: z.string({ error: 'obrigatória' }).min(1, 'obrigatória'),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    EMAIL_PROVIDER: z.enum(['mock', 'resend']).default('mock'),
    EMAIL_FROM: z.string().min(3).default('Conquista Park <nao-responda@example.com>'),
    RESEND_API_KEY: z.string().min(1).optional(),
    PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
    QR_SIGNING_KEY: chave,
    ORDER_LINK_KEY: chave,
    CPF_HASH_KEY: chave,
    CRON_SECRET: chave,
  })
  .superRefine((valores, ctx) => {
    if (valores.EMAIL_PROVIDER === 'resend' && !valores.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'obrigatória quando EMAIL_PROVIDER=resend',
      });
    }
    if (valores.NODE_ENV === 'production') {
      if (!valores.APP_URL.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['APP_URL'],
          message: 'em produção precisa começar com https://',
        });
      }
      if (valores.EMAIL_PROVIDER === 'mock') {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_PROVIDER'],
          message: 'em produção use um provedor real',
        });
      }
      for (const nome of CHAVES_OBRIGATORIAS_EM_PRODUCAO) {
        if (!valores[nome])
          ctx.addIssue({ code: 'custom', path: [nome], message: 'obrigatória em produção' });
      }
    }
  });

export type Env = z.infer<typeof schema>;

let cache: Env | undefined;

export function env(): Env {
  if (cache) return cache;
  // Variável vazia no .env conta como não definida.
  const definidas = Object.fromEntries(Object.entries(process.env).filter(([, valor]) => valor !== ''));
  const resultado = schema.safeParse(definidas);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(geral)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração inválida. Corrija as variáveis de ambiente:\n${problemas}`);
  }
  cache = resultado.data;
  return cache;
}

export function isProduction(): boolean {
  return env().NODE_ENV === 'production';
}

/**
 * Pagamento online disponível? O provedor de teste só vale fora de produção:
 * em produção, sem provedor real, o site não aceita compras.
 */
export function onlinePaymentsAvailable(): boolean {
  const config = env();
  return !(config.NODE_ENV === 'production' && config.PAYMENT_PROVIDER === 'mock');
}
