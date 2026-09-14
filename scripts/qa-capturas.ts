/**
 * Capturas de tela do painel para conferência visual, só em desenvolvimento.
 *
 * Cria uma sessão direto no banco local para a pessoa informada (sem digitar
 * senha em formulário), abre as páginas em Chromium sem janela, no computador
 * e no celular, e aponta erro de console e página mais larga que a tela.
 * No fim, encerra a sessão criada.
 *
 *   npx tsx --conditions=react-server scripts/qa-capturas.ts [email] [pasta] [trecho-do-nome]
 *
 * Com o terceiro argumento, captura só as páginas cujo nome contém o trecho (ex.: "venda").
 */
import 'dotenv/config';

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium, devices, type Page } from '@playwright/test';

import { createSession } from '@/server/auth/session';
import { sha256Hex } from '@/server/crypto';
import { prisma } from '@/server/db';
import { orderAccessToken } from '@/server/signing';

import { databaseTarget } from './lib/database-target';

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:3000';

async function paginas(parkId: string): Promise<{ nome: string; caminho: string }[]> {
  const [pedido, cliente, cupom, ingresso, bilhete] = await Promise.all([
    prisma.order.findFirst({
      where: { parkId, status: 'CONFIRMED', couponId: { not: null } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customer.findFirst({
      where: { parkId, orders: { some: { status: 'CONFIRMED' } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.coupon.findFirst({ where: { parkId }, orderBy: { createdAt: 'asc' } }),
    prisma.ticketType.findFirst({ where: { parkId }, orderBy: { sortOrder: 'asc' } }),
    prisma.ticket.findFirst({ where: { parkId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
  ]);
  const agora = new Date();
  const selecao = { id: true, code: true, accessVersion: true } as const;
  const [confirmado, pendente] = await Promise.all([
    prisma.order.findFirst({
      where: { parkId, status: 'CONFIRMED', visitDate: { gte: agora } },
      orderBy: { createdAt: 'desc' },
      select: selecao,
    }),
    prisma.order.findFirst({
      where: { parkId, status: 'PENDING_PAYMENT', expiresAt: { gt: agora } },
      orderBy: { createdAt: 'desc' },
      select: selecao,
    }),
  ]);
  const linkDoPedido = (item: { id: string; code: string; accessVersion: number }) =>
    `/pedido/${item.code}?t=${orderAccessToken(item)}`;

  return [
    { nome: 'site-inicio', caminho: '/' },
    { nome: 'site-comprar', caminho: '/comprar' },
    { nome: 'site-meus-ingressos', caminho: '/meus-ingressos' },
    { nome: 'site-politica', caminho: '/politicas/cancelamento' },
    { nome: 'site-contato', caminho: '/contato' },
    ...(confirmado ? [{ nome: 'site-pedido-confirmado', caminho: linkDoPedido(confirmado) }] : []),
    ...(pendente ? [{ nome: 'site-pedido-pix', caminho: linkDoPedido(pendente) }] : []),
    { nome: 'painel', caminho: '/admin' },
    { nome: 'painel-7-dias', caminho: '/admin?periodo=7d' },
    { nome: 'vendas', caminho: '/admin/vendas' },
    { nome: 'nova-venda', caminho: '/admin/vendas/nova' },
    ...(pedido ? [{ nome: 'venda', caminho: `/admin/vendas/${pedido.id}` }] : []),
    { nome: 'ingressos', caminho: '/admin/ingressos' },
    ...(bilhete ? [{ nome: 'ingresso', caminho: `/admin/ingressos/${bilhete.id}` }] : []),
    { nome: 'portaria', caminho: '/admin/portaria' },
    { nome: 'financeiro', caminho: '/admin/financeiro' },
    { nome: 'financeiro-ingressos', caminho: '/admin/financeiro/ingressos' },
    { nome: 'financeiro-lancamentos', caminho: '/admin/financeiro/lancamentos' },
    { nome: 'relatorios', caminho: '/admin/relatorios' },
    { nome: 'relatorio-vendas', caminho: '/admin/relatorios/vendas' },
    { nome: 'relatorio-visitantes', caminho: '/admin/relatorios/visitantes' },
    { nome: 'marketing', caminho: '/admin/marketing' },
    { nome: 'clientes', caminho: '/admin/clientes' },
    ...(cliente ? [{ nome: 'cliente', caminho: `/admin/clientes/${cliente.id}` }] : []),
    { nome: 'cupons', caminho: '/admin/cupons' },
    ...(cupom ? [{ nome: 'cupom', caminho: `/admin/cupons/${cupom.id}` }] : []),
    { nome: 'tipos-de-ingresso', caminho: '/admin/tipos-de-ingresso' },
    ...(ingresso ? [{ nome: 'tipo-de-ingresso', caminho: `/admin/tipos-de-ingresso/${ingresso.id}` }] : []),
    { nome: 'calendario', caminho: '/admin/calendario' },
    { nome: 'atividades', caminho: '/admin/atividades' },
    { nome: 'configuracoes', caminho: '/admin/configuracoes' },
  ];
}

async function conferir(page: Page, caminho: string, arquivo: string): Promise<string[]> {
  const problemas: string[] = [];
  const aoConsole = (mensagem: { type(): string; text(): string }) => {
    if (mensagem.type() === 'error') problemas.push(`console: ${mensagem.text().slice(0, 200)}`);
  };
  const aoErro = (erro: Error) => problemas.push(`erro na página: ${erro.message.slice(0, 200)}`);
  page.on('console', aoConsole);
  page.on('pageerror', aoErro);

  const resposta = await page.goto(`${BASE}${caminho}`, { waitUntil: 'networkidle', timeout: 60_000 });
  if (!resposta || resposta.status() >= 400) problemas.push(`HTTP ${resposta?.status() ?? 'sem resposta'}`);
  if (page.url().includes('/entrar')) problemas.push('redirecionou para o login');
  await page.waitForTimeout(700);
  const estouro = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (estouro > 1) {
    // Aponta os elementos que passam da borda direita, para achar a causa sem abrir o navegador.
    const culpados = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((elemento) => elemento.getBoundingClientRect().right > window.innerWidth + 1)
        .filter(
          (elemento) =>
            ![...elemento.children].some(
              (filho) => filho.getBoundingClientRect().right > window.innerWidth + 1,
            ),
        )
        .slice(0, 3)
        .map(
          (elemento) =>
            `${elemento.tagName.toLowerCase()}.${String(elemento.getAttribute('class') ?? '').slice(0, 90)}`,
        ),
    );
    problemas.push(`página ${estouro}px mais larga que a tela: ${culpados.join(' | ')}`);
  }
  await page.screenshot({ path: arquivo, fullPage: true });

  page.off('console', aoConsole);
  page.off('pageerror', aoErro);
  return problemas;
}

async function main(): Promise<void> {
  const alvo = databaseTarget();
  if (!alvo.isLocal || process.env.NODE_ENV === 'production') {
    console.error(`Recusado: ${alvo.host}/${alvo.database} não é um banco local de desenvolvimento.`);
    process.exitCode = 1;
    return;
  }

  const email = process.argv[2] ?? 'admin@conquistapark.dev';
  const pasta = path.resolve(process.argv[3] ?? '.data/capturas');
  mkdirSync(pasta, { recursive: true });

  const pessoa = await prisma.user.findUnique({
    where: { email },
    select: { id: true, roles: { select: { parkId: true }, take: 1 } },
  });
  const parkId = pessoa?.roles[0]?.parkId;
  if (!pessoa || !parkId) throw new Error(`Pessoa ${email} não encontrada com acesso a um parque.`);

  const { token } = await createSession(prisma, {
    userId: pessoa.id,
    parkId,
    meta: { ip: '127.0.0.1', userAgent: 'qa-capturas', requestId: `qa-${Date.now()}` },
  });

  const navegador = await chromium.launch();
  const trecho = process.argv[4];
  const lista = (await paginas(parkId)).filter((item) => !trecho || item.nome.includes(trecho));
  let comProblema = 0;
  try {
    for (const [dispositivo, opcoes] of [
      ['computador', { viewport: { width: 1440, height: 900 } }],
      ['celular', { ...devices['iPhone 13'] }],
    ] as const) {
      const contexto = await navegador.newContext({
        ...opcoes,
        locale: 'pt-BR',
        timezoneId: 'America/Bahia',
      });
      await contexto.addCookies([
        { name: 'cp_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
      ]);
      const page = await contexto.newPage();
      for (const item of lista) {
        const problemas = await conferir(
          page,
          item.caminho,
          path.join(pasta, `${dispositivo}-${item.nome}.png`),
        );
        if (problemas.length > 0) comProblema += 1;
        console.log(`${problemas.length ? 'ATENÇÃO' : 'ok     '} ${dispositivo.padEnd(10)} ${item.caminho}`);
        for (const problema of problemas) console.log(`         ${problema}`);
      }
      await contexto.close();
    }
  } finally {
    await navegador.close();
    await prisma.session.updateMany({
      where: { tokenHash: sha256Hex(token) },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    });
  }
  console.log(`\nCapturas em ${pasta}. Páginas com problema: ${comProblema}.`);
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
