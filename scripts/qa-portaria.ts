/**
 * Portaria de ponta a ponta, só em desenvolvimento, no celular e com câmera
 * simulada: o Chromium "filma" o QR Code de um ingresso válido para hoje.
 *
 * Com a pessoa da portaria: abre o painel (deve cair direto na portaria), lê o
 * QR (entrada liberada), lê de novo (entrada negada: já utilizado) e busca o
 * ingresso pelo nome. Registra a entrada de um ingresso de teste no banco local.
 *
 *   npx tsx --conditions=react-server scripts/qa-portaria.ts [email] [pasta]
 */
import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium, devices } from '@playwright/test';
import QRCode from 'qrcode';

import { dateOnlyToDb, todayIn } from '@/lib/dates';
import { createSession } from '@/server/auth/session';
import { sha256Hex } from '@/server/crypto';
import { prisma } from '@/server/db';
import { ticketQrPayload } from '@/server/signing';

import { databaseTarget } from './lib/database-target';

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:3000';

/** Vídeo Y4M de um quadro com o QR Code centralizado (preto no branco), para a câmera falsa do Chromium. */
function videoDoQr(conteudo: string, arquivo: string): void {
  const largura = 640;
  const altura = 480;
  const qr = QRCode.create(conteudo, { errorCorrectionLevel: 'M' });
  const modulos = qr.modules.size;
  const escala = Math.floor(360 / (modulos + 8));
  const lado = (modulos + 8) * escala;
  const x0 = Math.floor((largura - lado) / 2);
  const y0 = Math.floor((altura - lado) / 2);

  const luma = Buffer.alloc(largura * altura, 235);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const mx = Math.floor(x / escala) - 4;
      const my = Math.floor(y / escala) - 4;
      const escuro = mx >= 0 && my >= 0 && mx < modulos && my < modulos && qr.modules.get(my, mx) === 1;
      luma[(y0 + y) * largura + x0 + x] = escuro ? 16 : 235;
    }
  }
  const croma = Buffer.alloc((largura / 2) * (altura / 2), 128);
  const cabecalho = Buffer.from(`YUV4MPEG2 W${largura} H${altura} F10:1 Ip A1:1 C420jpeg\n`);
  const quadros: Buffer[] = [cabecalho];
  for (let i = 0; i < 10; i++) quadros.push(Buffer.from('FRAME\n'), luma, croma, croma);
  writeFileSync(arquivo, Buffer.concat(quadros));
}

async function main(): Promise<void> {
  const alvo = databaseTarget();
  if (!alvo.isLocal || process.env.NODE_ENV === 'production') {
    console.error(`Recusado: ${alvo.host}/${alvo.database} não é um banco local de desenvolvimento.`);
    process.exitCode = 1;
    return;
  }

  const email = process.argv[2] ?? 'portaria@conquistapark.dev';
  const pasta = path.resolve(process.argv[3] ?? '.data/capturas');
  mkdirSync(pasta, { recursive: true });

  const pessoa = await prisma.user.findUnique({
    where: { email },
    select: { id: true, roles: { select: { parkId: true, park: { select: { timezone: true } } }, take: 1 } },
  });
  const vinculo = pessoa?.roles[0];
  if (!pessoa || !vinculo) throw new Error(`Pessoa ${email} não encontrada com acesso a um parque.`);

  const hoje = todayIn(vinculo.park.timezone);
  const ingresso = await prisma.ticket.findFirst({
    where: { parkId: vinculo.parkId, status: 'ACTIVE', visitDate: dateOnlyToDb(hoje) },
    orderBy: { createdAt: 'desc' },
    select: { id: true, parkId: true, code: true, qrVersion: true, order: { select: { buyerName: true } } },
  });
  if (!ingresso)
    throw new Error(`Nenhum ingresso válido para hoje (${hoje}). Faça uma venda no balcão antes.`);

  const video = path.join(pasta, 'portaria-qr.y4m');
  videoDoQr(ticketQrPayload(ingresso), video);

  const { token } = await createSession(prisma, {
    userId: pessoa.id,
    parkId: vinculo.parkId,
    meta: { ip: '127.0.0.1', userAgent: 'qa-portaria', requestId: `qa-${Date.now()}` },
  });

  const navegador = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${video}`,
    ],
  });
  const erros: string[] = [];
  try {
    const contexto = await navegador.newContext({
      ...devices['Pixel 7'],
      locale: 'pt-BR',
      timezoneId: 'America/Bahia',
      permissions: ['camera'],
    });
    await contexto.addCookies([
      { name: 'cp_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
    ]);
    const page = await contexto.newPage();
    page.on('pageerror', (erro) => erros.push(erro.message));
    page.on('console', (mensagem) => {
      if (mensagem.type() === 'error') erros.push(mensagem.text());
    });

    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 60_000 });
    if (!page.url().endsWith('/admin/portaria'))
      throw new Error(`Esperava cair na portaria, abriu ${page.url()}`);
    await page.screenshot({ path: path.join(pasta, 'portaria-1-inicio.png'), fullPage: true });
    console.log('ok painel abre direto na portaria');

    await page.getByRole('button', { name: 'Escanear QR Code' }).click();
    await page.getByRole('heading', { name: 'Entrada liberada' }).waitFor({ timeout: 20_000 });
    await page.screenshot({ path: path.join(pasta, 'portaria-2-liberada.png') });
    console.log(`ok leitura liberou o ingresso ${ingresso.code} (${ingresso.order.buyerName})`);

    await page.getByRole('button', { name: 'Ler próximo ingresso' }).click();
    await page.getByRole('heading', { name: 'Entrada negada' }).waitFor({ timeout: 20_000 });
    await page.getByText('Ingresso já utilizado').first().waitFor();
    await page.screenshot({ path: path.join(pasta, 'portaria-3-negada.png') });
    console.log('ok segunda leitura negada: ingresso já utilizado');

    await page.getByRole('button', { name: 'Ler próximo ingresso' }).click();
    await page.getByRole('button', { name: 'Fechar câmera' }).click();
    await page.getByRole('searchbox', { name: 'Buscar ingresso' }).fill(ingresso.code);
    await page.getByText(ingresso.code).first().waitFor({ timeout: 10_000 });
    await page.screenshot({ path: path.join(pasta, 'portaria-4-busca.png'), fullPage: true });
    console.log('ok busca pelo código encontrou o ingresso');

    if (erros.length > 0) throw new Error(`Erros no navegador: ${erros.join(' | ').slice(0, 400)}`);
    await contexto.close();
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
