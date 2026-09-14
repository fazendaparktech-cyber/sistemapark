/**
 * Conferência da barra do topo do painel (busca e avisos), só em desenvolvimento.
 *
 * Cria uma sessão direto no banco local (sem digitar senha em formulário),
 * abre o painel no computador e no celular, busca um cliente de verdade pelo
 * nome, abre o primeiro resultado pelo teclado e abre o sino de avisos. Salva
 * capturas, aponta erro de console e página mais larga que a tela, e encerra a
 * sessão criada.
 *
 *   npx tsx --conditions=react-server scripts/qa-topo.ts [pasta]
 */
import 'dotenv/config';

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium, devices, type Page } from '@playwright/test';

import { createSession } from '@/server/auth/session';
import { sha256Hex } from '@/server/crypto';
import { prisma } from '@/server/db';

import { databaseTarget } from './lib/database-target';

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:3000';
const ROTULO_DA_BUSCA = 'Buscar cliente, CPF, telefone, pedido ou ingresso';

async function larguraExtra(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function main(): Promise<void> {
  const alvo = databaseTarget();
  if (!alvo.isLocal || process.env.NODE_ENV === 'production') {
    console.error(`Recusado: ${alvo.host}/${alvo.database} não é um banco local de desenvolvimento.`);
    process.exitCode = 1;
    return;
  }

  const pasta = path.resolve(process.argv[2] ?? '.data/capturas-topo');
  mkdirSync(pasta, { recursive: true });

  const pessoa = await prisma.user.findUnique({
    where: { email: 'admin@conquistapark.dev' },
    select: { id: true, roles: { select: { parkId: true }, take: 1 } },
  });
  const parkId = pessoa?.roles[0]?.parkId;
  if (!pessoa || !parkId) throw new Error('Administrador do ambiente local não encontrado.');
  const cliente = await prisma.customer.findFirst({
    where: { parkId, orders: { some: { status: 'CONFIRMED' } } },
    orderBy: { createdAt: 'asc' },
    select: { name: true },
  });
  if (!cliente) throw new Error('Nenhum cliente com compra no banco local.');

  const { token } = await createSession(prisma, {
    userId: pessoa.id,
    parkId,
    meta: { ip: '127.0.0.1', userAgent: 'qa-topo', requestId: `qa-${Date.now()}` },
  });

  let falhas = 0;
  const conferir = (ok: boolean, mensagem: string) => {
    if (!ok) falhas += 1;
    console.log(`${ok ? 'ok     ' : 'FALHA  '} ${mensagem}`);
  };

  const navegador = await chromium.launch();
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
      const erros: string[] = [];
      page.on('pageerror', (erro) => erros.push(erro.message));
      page.on('console', (mensagem) => {
        if (mensagem.type() === 'error') erros.push(mensagem.text());
      });

      await page.goto(`${BASE}/admin/vendas`, { waitUntil: 'networkidle', timeout: 60_000 });
      conferir((await larguraExtra(page)) <= 1, `${dispositivo}: topo cabe na tela`);

      if (dispositivo === 'computador') await page.keyboard.press('/');
      else await page.getByRole('button', { name: ROTULO_DA_BUSCA }).click();
      const campo = page.getByRole('textbox', { name: ROTULO_DA_BUSCA });
      await campo.waitFor({ state: 'visible' });
      conferir(
        await campo.evaluate((elemento) => elemento === document.activeElement),
        `${dispositivo}: busca abre com o cursor no campo`,
      );

      const termo = cliente.name.split(/\s+/).slice(0, 2).join(' ');
      await campo.fill(termo);
      const resultado = page.getByRole('link').filter({ hasText: cliente.name }).first();
      await resultado.waitFor({ state: 'visible', timeout: 15_000 });
      conferir(true, `${dispositivo}: "${termo}" encontra ${cliente.name}`);
      await page.screenshot({ path: path.join(pasta, `${dispositivo}-busca.png`) });

      await campo.press('Enter');
      await page.waitForURL(/\/admin\/(clientes|vendas|ingressos)\/[0-9a-f-]{36}/, { timeout: 20_000 });
      conferir(true, `${dispositivo}: Enter abre o primeiro resultado (${new URL(page.url()).pathname})`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /^Avisos/ }).click();
      const painelDeAvisos = page.getByText('Avisos', { exact: true });
      await painelDeAvisos.waitFor({ state: 'visible' });
      await page.waitForTimeout(800);
      conferir(
        (await page.getByText(/Carregando avisos|Não foi possível carregar/).count()) === 0,
        `${dispositivo}: sino carrega os avisos`,
      );
      await page.screenshot({ path: path.join(pasta, `${dispositivo}-avisos.png`) });
      await page.keyboard.press('Escape');

      conferir(
        erros.length === 0,
        `${dispositivo}: sem erro de console${erros.length ? `: ${erros.join(' | ')}` : ''}`,
      );
      await contexto.close();
    }
  } finally {
    await navegador.close();
    await prisma.session.updateMany({
      where: { tokenHash: sha256Hex(token) },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    });
  }

  console.log(`\nCapturas em ${pasta}. Conferências com problema: ${falhas}.`);
  if (falhas > 0) process.exitCode = 1;
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
