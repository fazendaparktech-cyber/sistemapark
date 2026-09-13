/**
 * Leva o catálogo de papéis e permissões do código para o banco.
 * Roda a cada deploy, depois das migrations. Idempotente.
 *
 *   npm run access:sync [-- --confirmar-banco <host>]
 */
import 'dotenv/config';

import { parseArgs } from 'node:util';

import { syncAccessCatalog } from '@/server/access/service';
import { prisma } from '@/server/db';

import { requireConfirmedTarget } from './lib/database-target';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'confirmar-banco': { type: 'string' } } });
  const alvo = requireConfirmedTarget(values['confirmar-banco']);
  console.log(`Sincronizando papéis e permissões em ${alvo.host}/${alvo.database}…`);

  const resumo = await syncAccessCatalog();
  console.log(
    `Permissões novas: ${resumo.permissionsCreated.length ? resumo.permissionsCreated.join(', ') : 'nenhuma'}`,
  );
  console.log(
    `Permissões removidas: ${resumo.permissionsRemoved.length ? resumo.permissionsRemoved.join(', ') : 'nenhuma'}`,
  );
  console.log(`Papéis novos: ${resumo.rolesCreated.length ? resumo.rolesCreated.join(', ') : 'nenhum'}`);
  console.log(`Concessões adicionadas: ${resumo.grantsAdded}`);
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
