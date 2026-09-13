import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, inject, it } from 'vitest';

import { assertSafeTestDatabase, prisma } from '@/server/db';

import { createPark } from '../helpers/factories';

describe('trava do banco de testes', () => {
  it('recusa banco remoto e banco que não termina em _test', () => {
    expect(() => assertSafeTestDatabase('postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres')).toThrow(
      /segurança/,
    );
    expect(() =>
      assertSafeTestDatabase('postgresql://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/sistemapark_test'),
    ).toThrow(/segurança/);
    expect(() => assertSafeTestDatabase('postgresql://u:p@127.0.0.1:5432/sistemapark_dev')).toThrow(
      /segurança/,
    );
    expect(() => assertSafeTestDatabase('isto não é uma url')).toThrow(/segurança/);
  });

  it('aceita Postgres local com banco *_test', () => {
    expect(() => assertSafeTestDatabase('postgresql://u:p@127.0.0.1:5432/sistemapark_test')).not.toThrow();
    expect(() => assertSafeTestDatabase(inject('databaseUrl'))).not.toThrow();
  });
});

describe('estrutura do banco', () => {
  it('toda tabela do schema public tem RLS ligado', async () => {
    const semRls = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      ORDER BY c.relname`;
    expect(semRls.map((linha) => linha.relname)).toEqual([]);
  });

  it('as migrations produzem exatamente o schema do Prisma', () => {
    const url = inject('databaseUrl');
    const ambiente: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
    delete ambiente.SHADOW_DATABASE_URL;
    try {
      execFileSync(
        path.resolve('node_modules/.bin/prisma'),
        ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'],
        { env: ambiente, stdio: 'pipe' },
      );
    } catch (erro) {
      const saida = erro as { status?: number; stdout?: Buffer; stderr?: Buffer };
      throw new Error(
        `Schema e migrations divergem (código ${saida.status}):\n${saida.stdout?.toString() ?? ''}${saida.stderr?.toString() ?? ''}`,
      );
    }
  });

  it('e-mail da equipe precisa chegar normalizado ao banco', async () => {
    await expect(
      prisma.user.create({
        data: { name: 'Fulano de Tal', email: 'Maiusculo@Teste.dev', passwordHash: 'x' },
      }),
    ).rejects.toThrow();
  });
});

describe('auditoria imutável', () => {
  it('recusa UPDATE, DELETE e TRUNCATE', async () => {
    const parque = await createPark();
    const registro = await prisma.auditLog.create({
      data: { action: 'teste.imutavel', parkId: parque.id, actorType: 'SYSTEM' },
    });

    await expect(
      prisma.auditLog.update({ where: { id: registro.id }, data: { action: 'teste.alterado' } }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: registro.id } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE audit_logs')).rejects.toThrow();

    const intacto = await prisma.auditLog.findUnique({ where: { id: registro.id } });
    expect(intacto?.action).toBe('teste.imutavel');
  });
});
