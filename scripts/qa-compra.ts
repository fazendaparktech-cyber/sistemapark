/**
 * Compra de ponta a ponta pela interface, como um cliente no celular:
 * escolhe a data e os ingressos, preenche os dados, aplica cupom, gera o PIX,
 * simula a confirmação do banco e confere os ingressos com QR Code.
 * Só em desenvolvimento, com o provedor de pagamento de teste.
 *
 *   npx tsx --conditions=react-server scripts/qa-compra.ts [pasta-das-capturas]
 */
import 'dotenv/config';

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium, devices } from '@playwright/test';

import { prisma } from '@/server/db';

import { databaseTarget } from './lib/database-target';

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:3000';

function digito(digitos: number[], tamanho: number): number {
  let soma = 0;
  for (let i = 0; i < tamanho; i++) soma += (digitos[i] ?? 0) * (tamanho + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function cpfDeTeste(): string {
  const base = Array.from({ length: 9 }, (_, i) => (Date.now() + i * 7) % 10);
  if (base.every((valor) => valor === base[0])) base[0] = ((base[0] ?? 0) + 1) % 10;
  const primeiro = digito(base, 9);
  return `${base.join('')}${primeiro}${digito([...base, primeiro], 10)}`;
}

async function main(): Promise<void> {
  const alvo = databaseTarget();
  if (!alvo.isLocal || process.env.NODE_ENV === 'production') {
    console.error(`Recusado: ${alvo.host}/${alvo.database} não é um banco local de desenvolvimento.`);
    process.exitCode = 1;
    return;
  }

  const pasta = path.resolve(process.argv[2] ?? '.data/capturas-compra');
  mkdirSync(pasta, { recursive: true });
  const errosDoConsole: string[] = [];
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({
    ...devices['iPhone 13'],
    locale: 'pt-BR',
    timezoneId: 'America/Bahia',
  });
  const page = await contexto.newPage();
  // Mostra o corpo das respostas de erro da API (ex.: campo recusado na validação).
  page.on('response', (resposta) => {
    if (!resposta.url().includes('/api/') || resposta.status() < 400) return;
    void resposta
      .text()
      .then((corpo) =>
        console.log(`API ${resposta.status()} ${new URL(resposta.url()).pathname}: ${corpo.slice(0, 400)}`),
      );
  });
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') errosDoConsole.push(mensagem.text().slice(0, 200));
  });
  page.on('pageerror', (erro) => errosDoConsole.push(`erro na página: ${erro.message.slice(0, 200)}`));
  const passo = async (nome: string) => {
    await page.screenshot({ path: path.join(pasta, `${nome}.png`), fullPage: true });
    console.log(`ok  ${nome}`);
  };

  try {
    await page.goto(`${BASE}/comprar?utm_source=qa&utm_campaign=teste-de-compra`, {
      waitUntil: 'networkidle',
    });
    const dia = page.locator('button[aria-pressed]:not([disabled])').first();
    await dia.waitFor({ timeout: 30_000 });
    await passo('1-calendario');
    await dia.click();

    const maisIngresso = page.getByRole('button', { name: 'Adicionar um Ingresso' });
    await maisIngresso.waitFor({ timeout: 30_000 });
    for (let i = 0; i < 3; i++) await maisIngresso.click();
    await passo('2-ingressos');
    await page.getByRole('button', { name: 'Continuar' }).click();

    await page.waitForURL('**/comprar/dados', { timeout: 30_000 });
    await page.locator('#comprador-nome').waitFor();
    await passo('3-dados-vazio');
    await page.locator('#comprador-nome').fill('Cliente de Teste da Silva');
    await page.locator('#comprador-email').fill(`qa-${Date.now()}@example.com`);
    await page.locator('#comprador-celular').fill('73999998888');
    await page.locator('#comprador-cpf').fill(cpfDeTeste());
    await page.locator('#comprador-nascimento').fill('1990-05-20');
    await page.locator('#comprador-cidade').fill('Ubatã');
    await page.getByLabel(/Eu também vou ao parque/).check();

    const nomes = page.locator('input[id^="visitante-"][id$="-nome"]');
    const quantidade = await nomes.count();
    for (let i = 0; i < quantidade; i++) {
      const campo = nomes.nth(i);
      if (!(await campo.inputValue())) await campo.fill(`Visitante ${i + 1} da Silva`);
    }
    const nascimentos = page.locator('input[id^="visitante-"][id$="-nascimento"]');
    for (let i = 0; i < (await nascimentos.count()); i++) await nascimentos.nth(i).fill('2019-05-10');

    await page.locator('#cupom').fill('VERAO10');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await page.getByRole('button', { name: 'Remover cupom' }).waitFor({ timeout: 15_000 });
    await page.getByLabel(/Li e aceito/).check();
    await passo('4-dados-preenchidos');

    await page.getByRole('button', { name: /^Pagar R\$/ }).click();
    await page.waitForURL('**/pedido/**', { timeout: 60_000 });
    await page.getByRole('heading', { name: 'Falta pouco: pague o PIX' }).waitFor({ timeout: 30_000 });
    await passo('5-pix');

    await page.getByRole('button', { name: 'Simular pagamento aprovado' }).click();
    await page.getByRole('heading', { name: 'Pedido confirmado' }).waitFor({ timeout: 30_000 });
    const qrCodes = await page.getByRole('img', { name: /QR Code do ingresso/ }).count();
    await passo('6-ingressos');

    const codigo = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) ?? '');
    const pedido = await prisma.order.findFirst({
      where: { code: codigo },
      select: {
        status: true,
        totalCents: true,
        discountCents: true,
        utmSource: true,
        _count: { select: { tickets: true } },
      },
    });
    console.log(`\nPedido ${codigo}: ${JSON.stringify(pedido)}`);
    console.log(`QR Codes na página: ${qrCodes}`);
    if (!pedido || pedido.status !== 'CONFIRMED' || qrCodes !== pedido._count.tickets) {
      process.exitCode = 1;
      console.log('FALHOU: pedido não confirmado ou quantidade de QR Codes diferente dos ingressos.');
    }
  } catch (erro) {
    process.exitCode = 1;
    await page.screenshot({ path: path.join(pasta, 'erro.png'), fullPage: true }).catch(() => undefined);
    console.error('FALHOU:', erro instanceof Error ? erro.message : erro);
  } finally {
    await navegador.close();
  }

  console.log(
    errosDoConsole.length ? `Erros de console:\n  ${errosDoConsole.join('\n  ')}` : 'Sem erros de console.',
  );
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
