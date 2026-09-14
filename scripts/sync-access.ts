/**
 * Leva o catálogo de papéis e permissões do código para o banco.
 * Roda a cada deploy, depois das migrations. Idempotente.
 *
 *   npm run access:sync [-- --confirmar-banco <host>] [--restaurar-padroes]
 *
 * `--restaurar-padroes` volta todos os perfis às permissões padrão do catálogo,
 * desfazendo ajustes feitos pelo painel. Use depois de uma revisão do catálogo.
 */
import 'dotenv/config';

import { parseArgs } from 'node:util';

import { restoreDefaultRolePermissions, syncAccessCatalog } from '@/server/access/service';
import { prisma } from '@/server/db';

import { requireConfirmedTarget } from './lib/database-target';

function lista(itens: readonly string[], vazio: string): string {
  return itens.length > 0 ? itens.join(', ') : vazio;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'confirmar-banco': { type: 'string' },
      'restaurar-padroes': { type: 'boolean', default: false },
    },
  });
  const alvo = requireConfirmedTarget(values['confirmar-banco']);
  console.log(`Sincronizando papéis e permissões em ${alvo.host}/${alvo.database}…`);

  const resumo = await syncAccessCatalog();
  console.log(`Permissões novas: ${lista(resumo.permissionsCreated, 'nenhuma')}`);
  console.log(`Permissões removidas: ${lista(resumo.permissionsRemoved, 'nenhuma')}`);
  console.log(`Papéis novos: ${lista(resumo.rolesCreated, 'nenhum')}`);
  console.log(`Papéis removidos: ${lista(resumo.rolesRemoved, 'nenhum')}`);
  console.log(`Concessões adicionadas: ${resumo.grantsAdded}`);

  if (values['restaurar-padroes']) {
    const restaurados = await restoreDefaultRolePermissions();
    if (restaurados.length === 0) console.log('Perfis já estavam no padrão.');
    for (const papel of restaurados) {
      console.log(
        `${papel.roleKey}: adicionadas ${lista(papel.added, 'nenhuma')}; removidas ${lista(papel.removed, 'nenhuma')}`,
      );
    }
  }
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
