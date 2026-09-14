import { NextResponse, type NextRequest } from 'next/server';

import { ORDER_ACCESS_COOKIE, orderAccessCookieOptions, orderPagePath } from '@/lib/order-access';

/**
 * Roda antes de toda requisição (exceto arquivos estáticos e prefetch):
 * - gera o request id que acompanha logs e respostas;
 * - recusa mutações na API vindas de outra origem (proteção contra CSRF,
 *   somada ao cookie SameSite=Lax e à exigência de JSON);
 * - aplica Content Security Policy com nonce nas páginas (pixels de marketing só no site);
 * - tira da URL o token do link do pedido, guardando-o num cookie daquele pedido.
 *
 * Autorização NÃO mora aqui: cada rota e cada página confere sessão e permissão.
 */

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rotas chamadas por servidores externos, com autenticação própria (assinatura ou segredo). */
const ROTAS_SEM_ORIGEM = ['/api/webhooks/', '/api/cron/'];

/** Telas da equipe: nenhum script nem destino de terceiros. */
const ROTAS_DA_EQUIPE = ['/admin', '/entrar', '/recuperar-senha', '/redefinir-senha', '/trocar-senha'];

/** Destinos dos pixels de marketing (Meta, TikTok e Google), liberados só nas páginas do site. */
const DESTINOS_DOS_PIXELS = [
  'https://www.facebook.com',
  'https://connect.facebook.net',
  'https://analytics.tiktok.com',
  'https://*.tiktokw.us',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'https://*.googletagmanager.com',
  'https://*.g.doubleclick.net',
  'https://*.google.com',
  'https://*.google.com.br',
].join(' ');

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

function politicaDeConteudo(nonce: string, desenvolvimento: boolean, site: boolean): string {
  const pixels = site ? ` ${DESTINOS_DOS_PIXELS}` : '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desenvolvimento ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${pixels}`,
    "font-src 'self'",
    `connect-src 'self'${desenvolvimento ? ' ws: wss:' : ''}${pixels}`,
    ...(site ? ['frame-src https://td.doubleclick.net https://www.googletagmanager.com'] : []),
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

  // Link do pedido com o token: o token vai para um cookie daquele pedido e sai da URL.
  const tokenDoPedido = req.method === 'GET' ? req.nextUrl.searchParams.get('t') : null;
  const codigoDoPedido = /^\/pedido\/([^/]+)$/.exec(pathname)?.[1];
  const caminhoDoPedido = codigoDoPedido ? orderPagePath(codigoDoPedido) : null;
  if (tokenDoPedido && caminhoDoPedido && tokenDoPedido.length <= 300) {
    const destino = req.nextUrl.clone();
    destino.searchParams.delete('t');
    const redirecionamento = NextResponse.redirect(destino, 307);
    redirecionamento.cookies.set(
      ORDER_ACCESS_COOKIE,
      tokenDoPedido,
      orderAccessCookieOptions(caminhoDoPedido),
    );
    redirecionamento.headers.set('x-request-id', requestId);
    redirecionamento.headers.set('cache-control', 'no-store');
    redirecionamento.headers.set('referrer-policy', 'no-referrer');
    return redirecionamento;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const site = !ROTAS_DA_EQUIPE.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`));
  const politica = politicaDeConteudo(nonce, process.env.NODE_ENV === 'development', site);
  cabecalhos.set('x-nonce', nonce);
  // O painel usa o caminho para, sem sessão, voltar à mesma página depois do login.
  cabecalhos.set('x-pathname', pathname);
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
