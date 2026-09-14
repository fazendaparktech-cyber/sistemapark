/**
 * Conferência do rastreamento no servidor local, só em desenvolvimento.
 *
 * Liga os pixels com IDs de teste e abre o site no Chromium com toda requisição
 * para fora do servidor local bloqueada (nada chega à Meta, ao TikTok nem ao
 * Google). Confere: código dos pixels carregado sem erro de CSP, eventos
 * enviados aos pixels, visualização gravada no funil com a campanha, token do
 * pedido fora da URL e telas da equipe sem pixel. No fim, devolve a
 * configuração de marketing como estava.
 *
 *   npx tsx --conditions=react-server scripts/qa-rastreio.ts
 */
import 'dotenv/config';

import { chromium } from '@playwright/test';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/server/db';
import { env } from '@/server/env';
import { orderAccessToken } from '@/server/signing';

import { databaseTarget } from './lib/database-target';

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:3000';
const CAMPANHA = 'qa-rastreio';
const IDS_DE_TESTE = {
  metaPixelId: '100000000000001',
  tiktokPixelId: 'CQATESTE000000000001',
  googleAnalyticsId: 'G-QATESTE001',
  googleAdsId: 'AW-100000001',
  googleAdsPurchaseLabel: 'qa-teste-compra',
};

async function main(): Promise<void> {
  const alvo = databaseTarget();
  if (!alvo.isLocal || process.env.NODE_ENV === 'production') {
    console.error(`Recusado: ${alvo.host}/${alvo.database} não é um banco local de desenvolvimento.`);
    process.exitCode = 1;
    return;
  }

  const parque = await prisma.park.findFirst({ where: { slug: env().PARK_SLUG }, select: { id: true } });
  if (!parque) throw new Error('Parque do site não encontrado.');
  const chave = { parkId_key: { parkId: parque.id, key: 'marketing' } };
  const anterior = await prisma.systemSetting.findUnique({ where: chave });

  let falhas = 0;
  const conferir = (ok: boolean, mensagem: string) => {
    if (!ok) falhas += 1;
    console.log(`${ok ? 'ok     ' : 'FALHA  '} ${mensagem}`);
  };

  await prisma.systemSetting.upsert({
    where: chave,
    create: { parkId: parque.id, key: 'marketing', value: IDS_DE_TESTE },
    update: { value: IDS_DE_TESTE },
  });
  const navegador = await chromium.launch();
  try {
    const contexto = await navegador.newContext({ locale: 'pt-BR', timezoneId: 'America/Bahia' });
    const bloqueadas = new Set<string>();
    await contexto.route('**/*', (rota) => {
      const url = new URL(rota.request().url());
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return rota.continue();
      bloqueadas.add(url.hostname);
      return rota.abort();
    });
    const page = await contexto.newPage();
    const erros: string[] = [];
    page.on('pageerror', (erro) => erros.push(`erro na página: ${erro.message}`));
    page.on('console', (mensagem) => {
      const texto = mensagem.text();
      // Requisições externas bloqueadas de propósito aparecem como falha de carregamento.
      if (mensagem.type() === 'error' && !texto.includes('net::ERR_FAILED')) erros.push(texto);
    });

    const inicio = new Date();
    await page.goto(`${BASE}/comprar?utm_source=instagram&utm_medium=social&utm_campaign=${CAMPANHA}`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    await page.waitForFunction(() => Boolean(window.cpRastreio), null, { timeout: 15_000 });
    await page.waitForTimeout(1000);
    const estado = await page.evaluate(() => {
      const fila = (window.fbq as unknown as { queue?: ArrayLike<unknown>[] } | undefined)?.queue ?? [];
      return {
        fbq: typeof window.fbq,
        ttq: typeof window.ttq,
        gtag: typeof window.gtag,
        conversao: window.cpRastreio?.googleAdsPurchase ?? null,
        eventosMeta: fila.map((chamada) => String(Array.from(chamada)[1])),
        camadaGoogle: ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map(
          (item) => String(Array.from(item)[1] ?? ''),
        ),
      };
    });
    conferir(estado.fbq === 'function', 'Pixel da Meta preparado');
    conferir(estado.ttq === 'object', 'Pixel do TikTok preparado');
    conferir(estado.gtag === 'function', 'Google (Analytics e Ads) preparado');
    conferir(
      estado.conversao === 'AW-100000001/qa-teste-compra',
      'conversão de compra do Google Ads configurada',
    );
    conferir(
      estado.eventosMeta.includes('PageView') && estado.eventosMeta.includes('ViewContent'),
      `Meta recebeu PageView e ViewContent (${estado.eventosMeta.join(', ')})`,
    );
    conferir(
      estado.camadaGoogle.includes('G-QATESTE001') && estado.camadaGoogle.includes('view_item_list'),
      'Google recebeu a configuração e a visualização dos ingressos',
    );
    conferir(
      ['connect.facebook.net', 'analytics.tiktok.com', 'www.googletagmanager.com'].every((host) =>
        bloqueadas.has(host),
      ),
      `scripts externos pedidos e bloqueados pelo teste (${[...bloqueadas].sort().join(', ')})`,
    );

    let visualizacao = null;
    for (let tentativa = 0; tentativa < 10 && !visualizacao; tentativa++) {
      visualizacao = await prisma.trackingEvent.findFirst({
        where: { parkId: parque.id, type: 'VIEW_TICKETS', utmCampaign: CAMPANHA, createdAt: { gte: inicio } },
      });
      if (!visualizacao) await page.waitForTimeout(500);
    }
    conferir(
      visualizacao?.utmSource === 'instagram' && Boolean(visualizacao.visitorId),
      'visualização dos ingressos gravada no funil com origem e navegador',
    );

    const pedido = await prisma.order.findFirst({
      where: { parkId: parque.id, status: 'CONFIRMED', channel: 'ONLINE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, accessVersion: true },
    });
    if (pedido) {
      await page.goto(`${BASE}/pedido/${pedido.code}?t=${orderAccessToken(pedido)}`, {
        waitUntil: 'networkidle',
        timeout: 60_000,
      });
      conferir(page.url() === `${BASE}/pedido/${pedido.code}`, 'link do pedido abre sem o token na URL');
      conferir(
        (await page.getByRole('heading', { name: 'Pedido confirmado' }).count()) === 1,
        'pedido abre com os ingressos',
      );
      await page.reload({ waitUntil: 'networkidle' });
      conferir(
        (await page.getByRole('heading', { name: 'Pedido confirmado' }).count()) === 1,
        'recarregar a página continua abrindo o pedido (cookie do pedido)',
      );
      const cookie = (await contexto.cookies()).find((item) => item.name === 'cp_pedido');
      conferir(
        cookie?.path === `/pedido/${pedido.code}` && cookie.httpOnly,
        'cookie do pedido restrito à página daquele pedido',
      );
    }

    const login = await fetch(`${BASE}/entrar`);
    const html = await login.text();
    conferir(
      !/facebook|tiktok|googletagmanager/.test(login.headers.get('content-security-policy') ?? 'x') &&
        !html.includes('fbevents') &&
        !html.includes('cpRastreio'),
      'telas da equipe sem pixel e sem destinos de terceiros na CSP',
    );

    conferir(
      erros.length === 0,
      `sem erro de console ou de CSP${erros.length ? `: ${erros.join(' | ')}` : ''}`,
    );
    await contexto.close();
  } finally {
    await navegador.close();
    if (anterior) {
      await prisma.systemSetting.update({
        where: chave,
        data: { value: anterior.value as Prisma.InputJsonValue },
      });
    } else {
      await prisma.systemSetting.delete({ where: chave });
    }
  }

  console.log(`\nConferências com problema: ${falhas}. Configuração de marketing devolvida como estava.`);
  if (falhas > 0) process.exitCode = 1;
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
