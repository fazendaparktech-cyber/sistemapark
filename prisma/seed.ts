/**
 * Dados fictícios para desenvolvimento local. Recusa rodar fora de um banco
 * local — nunca popula produção.
 *
 *   npm run db:seed
 *
 * Cada fase acrescenta o que precisa (tipos de ingresso, pedidos, check-ins…).
 */
import 'dotenv/config';

import type { RoleKey } from '@/lib/access';
import { syncAccessCatalog } from '@/server/access/service';
import { hashPassword } from '@/server/auth/password';
import { prisma } from '@/server/db';
import { ensurePark } from '@/server/parks/service';

import { databaseTarget } from '../scripts/lib/database-target';
import { seedVendas } from './seed-vendas';

/** Só existe no banco local de desenvolvimento. */
const SENHA_DEV = 'Parque-Dev-2026!';

const EQUIPE: { name: string; email: string; roles: RoleKey[] }[] = [
  { name: 'Ana Administração', email: 'admin@conquistapark.dev', roles: ['SUPER_ADMIN'] },
  { name: 'Gustavo Gerência', email: 'gerente@conquistapark.dev', roles: ['MANAGER'] },
  { name: 'Fernanda Financeiro', email: 'financeiro@conquistapark.dev', roles: ['FINANCE'] },
  { name: 'Paulo Portaria', email: 'portaria@conquistapark.dev', roles: ['GATE'] },
  { name: 'Beatriz Bilheteria', email: 'bilheteria@conquistapark.dev', roles: ['BOX_OFFICE'] },
  { name: 'Marcos Marketing', email: 'marketing@conquistapark.dev', roles: ['MARKETING'] },
];

async function main(): Promise<void> {
  const alvo = databaseTarget();
  if (!alvo.isLocal || process.env.NODE_ENV === 'production') {
    console.error(`Seed recusado: ${alvo.host}/${alvo.database} não é um banco local de desenvolvimento.`);
    process.exitCode = 1;
    return;
  }

  await syncAccessCatalog();
  const parque = await ensurePark({ name: 'Conquista Park', slug: 'conquista-park' });
  await prisma.park.update({
    where: { id: parque.id },
    data: {
      legalName: 'Conquista Park Lazer Ltda (fictício)',
      email: 'contato@conquistapark.dev',
      whatsapp: '5573999990000',
      city: 'Ubatã',
      state: 'BA',
    },
  });

  const passwordHash = await hashPassword(SENHA_DEV);
  const papeis = new Map(
    (await prisma.role.findMany({ select: { id: true, key: true } })).map((r) => [r.key, r.id]),
  );

  for (const pessoa of EQUIPE) {
    const existente = await prisma.user.findUnique({ where: { email: pessoa.email }, select: { id: true } });
    if (existente) continue;
    await prisma.user.create({
      data: {
        name: pessoa.name,
        email: pessoa.email,
        passwordHash,
        roles: {
          create: pessoa.roles.flatMap((papel) => {
            const roleId = papeis.get(papel);
            return roleId ? [{ parkId: parque.id, roleId }] : [];
          }),
        },
      },
    });
  }

  const idPorEmail = async (email: string) =>
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id ?? null;
  const resumoDeVendas = await seedVendas(
    prisma,
    { id: parque.id, timezone: parque.timezone, orderCodePrefix: parque.orderCodePrefix },
    {
      admin: await idPorEmail('admin@conquistapark.dev'),
      bilheteria: await idPorEmail('bilheteria@conquistapark.dev'),
      portaria: await idPorEmail('portaria@conquistapark.dev'),
    },
  );

  console.log(`\nSeed aplicado em ${alvo.host}/${alvo.database} — parque ${parque.name}.`);
  console.log(`Equipe (senha de desenvolvimento: ${SENHA_DEV}):`);
  for (const pessoa of EQUIPE) console.log(`  ${pessoa.email.padEnd(32)} ${pessoa.roles.join(', ')}`);
  console.log(resumoDeVendas);
}

main()
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
