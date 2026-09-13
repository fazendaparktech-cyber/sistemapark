import { NextResponse, type NextRequest } from 'next/server';

/**
 * Roda antes de toda requisição (exceto arquivos estáticos e prefetch):
 * - gera o request id que acompanha logs e respostas;
 * - recusa mutações na API vindas de outra origem (proteção contra CSRF,
 *   somada ao cookie SameSite=Lax e à exigência de JSON);
 * - aplica Content Security Policy com nonce nas páginas.
 *
 * Autorização NÃO mora aqui: cada rota e cada página confere sessão e permissão.
 */

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rotas chamadas por servidores externos, com autenticação própria (assinatura ou segredo). */
const ROTAS_SEM_ORIGEM = ['/api/webhooks/', '/api/cron/'];

function origemConfere(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  let hostDaOrigem: string;
  try {
    hostDaOrigem = new URL(origin).host;
  } catch {
    return false;
  }
  const hostDoPedido = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  return hostDaOrigem === hostDoPedido;
}

function politicaDeConteudo(nonce: string, desenvolvimento: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desenvolvimento ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${desenvolvimento ? ' ws: wss:' : ''}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(desenvolvimento ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function proxy(req: NextRequest): NextResponse {
  const requestId = crypto.randomUUID();
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set('x-request-id', requestId);
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    const exigeOrigem =
      !METODOS_SEGUROS.has(req.method) && !ROTAS_SEM_ORIGEM.some((rota) => pathname.startsWith(rota));
    if (exigeOrigem && !origemConfere(req)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_ORIGIN',
            message: 'Requisição recusada: origem não autorizada.',
            details: {},
          },
        },
        { status: 403, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
      );
    }
    const resposta = NextResponse.next({ request: { headers: cabecalhos } });
    resposta.headers.set('x-request-id', requestId);
    return resposta;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const politica = politicaDeConteudo(nonce, process.env.NODE_ENV === 'development');
  cabecalhos.set('x-nonce', nonce);
  cabecalhos.set('Content-Security-Policy', politica);

  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  resposta.headers.set('Content-Security-Policy', politica);
  resposta.headers.set('x-request-id', requestId);
  return resposta;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|brand/|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
