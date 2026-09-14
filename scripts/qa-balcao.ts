/**
 * Venda no balcão de ponta a ponta pela interface, só em desenvolvimento:
 * dinheiro com troco no computador e PIX (pagamento simulado) no celular.
 *
 * Cria uma sessão direto no banco local (sem digitar senha), registra duas
 * vendas de teste no parque, salva capturas de cada etapa e encerra a sessão.
 *
 *   npx tsx --conditions=react-server scripts/qa-balcao.ts [email] [pasta]
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

async function esperarHabilitado(page: Page, nome: RegExp): Promise<void> {
  const botao = page.getByRole('button', { name: nome }).first();
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    if ((await botao.count()) > 0 && (await botao.isEnabled())) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Botão ${nome} não ficou disponível.`);
}

async function vender(page: Page, forma: 'CASH' | 'PIX', prefixo: string): Promise<string> {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(mensagem.text());
  });

  await page.goto(`${BASE}/admin/vendas/nova`, { waitUntil: 'networkidle', timeout: 60_000 });
  if ((await page.getByText('O parque não abre nesta data').count()) > 0) {
    await page.getByRole('group', { name: 'Próximos dias abertos' }).getByRole('button').first().click();
    await page.waitForLoadState('networkidle');
  }

  const adicionar = page.getByRole('button', { name: /^Adicionar um/ }).first();
  await adicionar.click();
  await adicionar.click();
  await page.locator('#pdv-nome').fill('Cliente Teste Balcão');
  await page.locator('#pdv-celular').fill('73991112233');
  if (forma === 'PIX') await page.getByRole('radio', { name: 'PIX' }).click();

  const finalizar = /^(Receber|Gerar PIX|Finalizar venda|Emitir ingressos)/;
  await esperarHabilitado(page, finalizar);
  if (forma === 'CASH') {
    await page.getByRole('button', { name: /200,00$/ }).click();
    await page.getByText(/^Troco: /).waitFor({ timeout: 5_000 });
  }
  await page.screenshot({ path: `${prefixo}-1-carrinho.png`, fullPage: true });

  await page.getByRole('button', { name: finalizar }).first().click();
  if (forma === 'PIX') {
    await page.getByRole('img', { name: 'QR Code do PIX' }).waitFor({ timeout: 20_000 });
    await page.screenshot({ path: `${prefixo}-2-pix.png`, fullPage: true });
    await page.getByRole('button', { name: 'Simular PIX pago' }).click();
  }
  await page.getByRole('heading', { name: 'Venda confirmada' }).waitFor({ timeout: 20_000 });
  await page.screenshot({ path: `${prefixo}-3-confirmada.png`, fullPage: true });

  const codigo =
    (await page.locator('p', { hasText: 'Pedido ' }).locator('span.font-mono').first().textContent()) ?? '';
  if (erros.length > 0) throw new Error(`Erros no navegador: ${erros.join(' | ').slice(0, 400)}`);
  return codigo.trim();
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
    meta: { ip: '127.0.0.1', userAgent: 'qa-balcao', requestId: `qa-${Date.now()}` },
  });

  const navegador = await chromium.launch();
  try {
    for (const [dispositivo, opcoes, forma] of [
      ['computador', { viewport: { width: 1440, height: 900 } }, 'CASH'],
      ['celular', { ...devices['iPhone 13'] }, 'PIX'],
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
      const codigo = await vender(page, forma, path.join(pasta, `balcao-${dispositivo}`));
      console.log(`ok ${dispositivo.padEnd(10)} ${forma === 'CASH' ? 'dinheiro' : 'PIX'} -> venda ${codigo}`);
      await contexto.close();
    }
  } finally {
    await navegador.close();
    await prisma.session.updateMany({
      where: { tokenHash: sha256Hex(token) },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    });
  }
  console.log(`\nCapturas em ${pasta}.`);
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
