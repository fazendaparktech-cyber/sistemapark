import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { ORDER_ACCESS_COOKIE } from '@/lib/order-access';
import { proxy } from '@/proxy';

const BASE = 'http://localhost:3000';

describe('proxy', () => {
  it('troca o token do link do pedido por um cookie daquele pedido e limpa a URL', () => {
    const resposta = proxy(new NextRequest(`${BASE}/pedido/CP-2026-000123?t=abc.def-123`));
    expect(resposta.status).toBe(307);
    expect(resposta.headers.get('location')).toBe(`${BASE}/pedido/CP-2026-000123`);
    expect(resposta.cookies.get(ORDER_ACCESS_COOKIE)).toMatchObject({
      value: 'abc.def-123',
      path: '/pedido/CP-2026-000123',
      httpOnly: true,
      sameSite: 'lax',
    });
  });

  it('página do pedido sem token segue normalmente', () => {
    const resposta = proxy(new NextRequest(`${BASE}/pedido/CP-2026-000123`));
    expect(resposta.status).toBe(200);
    expect(resposta.cookies.get(ORDER_ACCESS_COOKIE)).toBeUndefined();
  });

  it('só as páginas do site liberam os destinos dos pixels de marketing', () => {
    const site = proxy(new NextRequest(`${BASE}/comprar`)).headers.get('content-security-policy') ?? '';
    const painel =
      proxy(new NextRequest(`${BASE}/admin/vendas`)).headers.get('content-security-policy') ?? '';
    const login = proxy(new NextRequest(`${BASE}/entrar`)).headers.get('content-security-policy') ?? '';
    expect(site).toContain('https://connect.facebook.net');
    expect(site).toContain('https://analytics.tiktok.com');
    expect(site).toContain('https://*.google-analytics.com');
    expect(site).toContain('frame-src');
    for (const politica of [painel, login]) {
      expect(politica).not.toMatch(/facebook|tiktok|google/);
      expect(politica).not.toContain('frame-src');
    }
  });
});
