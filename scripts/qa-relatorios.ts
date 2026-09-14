/**
 * Conferência dos relatórios no servidor local, só em desenvolvimento.
 *
 * Cria sessões direto no banco local (sem digitar senha em formulário), abre as
 * telas de todos os relatórios, baixa cada um em CSV e em Excel e confere os
 * arquivos recebidos. Confere também que o perfil de marketing não baixa
 * planilhas. No fim, encerra as sessões criadas.
 *
 *   npx tsx --conditions=react-server scripts/qa-relatorios.ts [periodo]
 */
import 'dotenv/config';

import { strFromU8, unzipSync } from 'fflate';

import { REPORT_KEYS, REPORTS } from '@/lib/reports';
import { createSession } from '@/server/auth/session';
import { sha256Hex } from '@/server/crypto';
import { prisma } from '@/server/db';

import { databaseTarget } from './lib/database-target';

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:3000';

async function abrirSessao(email: string): Promise<string> {
  const pessoa = await prisma.user.findUnique({
    where: { email },
    select: { id: true, roles: { select: { parkId: true }, take: 1 } },
  });
  const parkId = pessoa?.roles[0]?.parkId;
  if (!pessoa || !parkId) throw new Error(`Pessoa ${email} não encontrada com acesso a um parque.`);
  const { token } = await createSession(prisma, {
    userId: pessoa.id,
    parkId,
    meta: { ip: '127.0.0.1', userAgent: 'qa-relatorios', requestId: `qa-${Date.now()}` },
  });
  return token;
}

function buscar(token: string, caminho: string): Promise<Response> {
  return fetch(`${BASE}${caminho}`, { headers: { cookie: `cp_session=${token}` }, redirect: 'manual' });
}

async function main(): Promise<void> {
  const alvo = databaseTarget();
  if (!alvo.isLocal || process.env.NODE_ENV === 'production') {
    console.error(`Recusado: ${alvo.host}/${alvo.database} não é um banco local de desenvolvimento.`);
    process.exitCode = 1;
    return;
  }

  const periodo = process.argv[2] ?? 'ano';
  const tokens: string[] = [];
  let falhas = 0;
  const falhar = (mensagem: string) => {
    falhas += 1;
    console.log(`FALHA   ${mensagem}`);
  };

  try {
    const admin = await abrirSessao('admin@conquistapark.dev');
    tokens.push(admin);

    for (const chave of REPORT_KEYS) {
      const tela = await buscar(admin, `/admin/relatorios/${chave}?periodo=${periodo}`);
      const html = await tela.text();
      if (tela.status !== 200 || !html.includes(REPORTS[chave].title)) {
        falhar(`${chave}: tela respondeu ${tela.status}`);
        continue;
      }

      const csv = await buscar(admin, `/api/admin/reports/${chave}/export?formato=csv&periodo=${periodo}`);
      const conteudo = new Uint8Array(await csv.arrayBuffer());
      // O fetch tira o BOM ao decodificar o texto: confere os bytes EF BB BF direto.
      const temBom = conteudo[0] === 0xef && conteudo[1] === 0xbb && conteudo[2] === 0xbf;
      const texto = new TextDecoder().decode(conteudo);
      const linhas = texto.split('\r\n').filter(Boolean).length;
      if (
        csv.status !== 200 ||
        !csv.headers.get('content-type')?.startsWith('text/csv') ||
        !csv.headers.get('content-disposition')?.includes(`filename="${chave}-`) ||
        !temBom
      ) {
        falhar(`${chave}: CSV respondeu ${csv.status} ${csv.headers.get('content-type')}`);
        continue;
      }

      const xlsx = await buscar(admin, `/api/admin/reports/${chave}/export?formato=xlsx&periodo=${periodo}`);
      const bytes = new Uint8Array(await xlsx.arrayBuffer());
      let aba = '';
      try {
        aba = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml'] ?? new Uint8Array());
      } catch {
        aba = '';
      }
      if (
        xlsx.status !== 200 ||
        !xlsx.headers.get('content-type')?.includes('spreadsheetml') ||
        !aba.includes('<row r="1">')
      ) {
        falhar(`${chave}: Excel respondeu ${xlsx.status} ${xlsx.headers.get('content-type')}`);
        continue;
      }

      const linhasDaAba = aba.split('<row ').length - 1;
      console.log(
        `ok      ${chave.padEnd(12)} tela, CSV (${linhas} linhas) e Excel (${linhasDaAba} linhas, ${Math.ceil(bytes.length / 1024)} KB)`,
      );
    }

    const marketing = await abrirSessao('marketing@conquistapark.dev');
    tokens.push(marketing);
    const negada = await buscar(marketing, `/api/admin/reports/origem/export?formato=csv&periodo=${periodo}`);
    if (negada.status === 403) console.log('ok      marketing não baixa planilhas (403)');
    else falhar(`marketing baixou planilha: ${negada.status}`);
    const vendas = await buscar(
      marketing,
      `/api/admin/reports/vendas/export?formato=xlsx&periodo=${periodo}`,
    );
    if (vendas.status === 403) console.log('ok      marketing não abre o relatório de vendas (403)');
    else falhar(`marketing abriu vendas: ${vendas.status}`);
  } finally {
    await prisma.session.updateMany({
      where: { tokenHash: { in: tokens.map((token) => sha256Hex(token)) } },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    });
  }

  console.log(`\nRelatórios com problema: ${falhas}.`);
  if (falhas > 0) process.exitCode = 1;
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
