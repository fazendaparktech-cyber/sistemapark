import type { NextConfig } from 'next';

const producao = process.env.NODE_ENV === 'production';

/** Cabeçalhos de segurança de todas as respostas. A CSP com nonce é aplicada em `src/proxy.ts`. */
const cabecalhosDeSeguranca = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  ...(producao ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: 'standalone',
  // Sem o selo do Next.js sobre a interface durante o desenvolvimento.
  devIndicators: false,
  async redirects() {
    return [
      // Endereços antigos do painel (links salvos e e-mails internos).
      { source: '/admin/pedidos', destination: '/admin/vendas', permanent: true },
      { source: '/admin/pedidos/:id', destination: '/admin/vendas/:id', permanent: true },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: cabecalhosDeSeguranca },
      {
        // A portaria precisa da câmera para ler os QR Codes.
        source: '/admin/portaria/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
