/**
 * Cria o primeiro super admin do parque — o jeito seguro de dar o primeiro
 * acesso, sem usuário ou senha padrão. A senha é gerada aqui, aparece uma única
 * vez e precisa ser trocada no primeiro login.
 *
 *   npm run admin:create -- --nome "Fulano de Tal" --email fulano@parque.com.br
 *
 * Opções:
 *   --parque-nome "Conquista Park"   nome do parque, se ainda não existir
 *   --parque-slug conquista-park     identificador do parque
 *   --adicional                      cria mesmo que já exista super admin
 *   --confirmar-banco <host>         obrigatório quando o banco não é local
 */
import 'dotenv/config';

import { userInfo } from 'node:os';
import { parseArgs } from 'node:util';

import { emailSchema, personNameSchema } from '@/lib/validation';
import { syncAccessCatalog } from '@/server/access/service';
import { recordAudit } from '@/server/audit';
import { hashPassword } from '@/server/auth/password';
import { generateStrongPassword } from '@/server/crypto';
import { prisma } from '@/server/db';
import { ensurePark } from '@/server/parks/service';

import { requireConfirmedTarget } from './lib/database-target';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      nome: { type: 'string' },
      email: { type: 'string' },
      'parque-nome': { type: 'string', default: 'Conquista Park' },
      'parque-slug': { type: 'string', default: 'conquista-park' },
      adicional: { type: 'boolean', default: false },
      'confirmar-banco': { type: 'string' },
    },
  });

  const nome = personNameSchema.safeParse(values.nome ?? '');
  const email = emailSchema.safeParse(values.email ?? '');
  if (!nome.success || !email.success) {
    console.error('Uso: npm run admin:create -- --nome "Nome Completo" --email pessoa@dominio.com.br');
    process.exitCode = 1;
    return;
  }

  const alvo = requireConfirmedTarget(values['confirmar-banco']);
  console.log(`Banco: ${alvo.host}/${alvo.database}`);

  await syncAccessCatalog();
  const parque = await ensurePark({ name: values['parque-nome'], slug: values['parque-slug'] });

  const superAdminsAtivos = await prisma.userRole.count({
    where: { parkId: parque.id, role: { key: 'SUPER_ADMIN' }, user: { status: 'ACTIVE' } },
  });
  if (superAdminsAtivos > 0 && !values.adicional) {
    console.error(
      `O parque ${parque.name} já tem ${superAdminsAtivos} super admin ativo. ` +
        'Novas pessoas devem ser cadastradas pelo painel. Para criar outro super admin por aqui, use --adicional.',
    );
    process.exitCode = 1;
    return;
  }

  if (await prisma.user.findUnique({ where: { email: email.data }, select: { id: true } })) {
    console.error(`Já existe uma pessoa com o e-mail ${email.data}.`);
    process.exitCode = 1;
    return;
  }

  const senha = generateStrongPassword();
  const passwordHash = await hashPassword(senha);
  const papel = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' }, select: { id: true } });

  const usuario = await prisma.$transaction(async (tx) => {
    const criado = await tx.user.create({
      data: {
        name: nome.data,
        email: email.data,
        passwordHash,
        mustChangePassword: true,
        roles: { create: { parkId: parque.id, roleId: papel.id } },
      },
      select: { id: true },
    });
    await recordAudit(tx, {
      action: 'users.created',
      parkId: parque.id,
      actorType: 'SYSTEM',
      entityType: 'user',
      entityId: criado.id,
      after: { name: nome.data, email: email.data, roles: ['SUPER_ADMIN'] },
      data: { via: 'cli', osUser: userInfo().username },
    });
    return criado;
  });

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  console.log(`
Super admin criado no parque ${parque.name}.

  E-mail:           ${email.data}
  Senha temporária: ${senha}

A senha aparece só agora. No primeiro acesso (${appUrl}/entrar) o sistema pede uma senha nova.
Id: ${usuario.id}`);
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
