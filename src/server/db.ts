import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, type Prisma } from '@/generated/prisma/client';

/** Cliente dentro de uma transação interativa. */
export type Tx = Prisma.TransactionClient;

/** Qualquer um dos dois: cliente principal ou transação em andamento. */
export type DbClient = PrismaClient | Tx;

const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Trava contra um incidente que já aconteceu em outro projeto: teste apagando
 * banco de produção. Com NODE_ENV=test, só conecta em Postgres local cujo banco
 * termine em `_test`.
 */
export function assertSafeTestDatabase(url: string): void {
  if (process.env.NODE_ENV !== 'test') return;
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    throw new Error('[segurança] NODE_ENV=test com DATABASE_URL ilegível. Abortando.');
  }
  const banco = decodeURIComponent(alvo.pathname.replace(/^\//, ''));
  if (!HOSTS_LOCAIS.has(alvo.hostname) || !banco.endsWith('_test')) {
    throw new Error(
      `[segurança] Testes só rodam em Postgres local com banco *_test. Recusado: ${alvo.hostname}/${banco}.`,
    );
  }
}

function criarCliente(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL não configurada.');
  assertSafeTestDatabase(connectionString);
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

function cliente(): PrismaClient {
  globalParaPrisma.prisma ??= criarCliente();
  return globalParaPrisma.prisma;
}

/**
 * Conexão preguiçosa: o cliente só é criado na primeira consulta, então o build
 * e os módulos que só importam tipos não precisam de banco.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_alvo, propriedade) {
    const real = cliente();
    const valor: unknown = Reflect.get(real, propriedade, real);
    return typeof valor === 'function' ? valor.bind(real) : valor;
  },
});
