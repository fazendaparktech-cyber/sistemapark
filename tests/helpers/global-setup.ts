import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

/**
 * Banco dos testes de integração: um Postgres 17 local, descartável, criado do
 * zero a cada execução e migrado com as mesmas migrations de produção.
 * Nunca usa o DATABASE_URL do .env.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const HOST = '127.0.0.1';
const USER = 'postgres';
const PASSWORD = 'postgres-test';
const DATABASE = 'sistemapark_test';

function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.unref();
    servidor.on('error', reject);
    servidor.listen(0, HOST, () => {
      const endereco = servidor.address();
      servidor.close(() => (typeof endereco === 'object' && endereco ? resolve(endereco.port) : reject()));
    });
  });
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const porta = await portaLivre();
  const pasta = path.resolve('.data', `postgres-test-${porta}`);
  rmSync(pasta, { recursive: true, force: true });

  const servidor = new EmbeddedPostgres({
    databaseDir: pasta,
    port: porta,
    user: USER,
    password: PASSWORD,
    authMethod: 'scram-sha-256',
    persistent: false,
    postgresFlags: [
      '-c',
      `listen_addresses=${HOST}`,
      '-c',
      'timezone=UTC',
      '-c',
      'fsync=off',
      '-c',
      'synchronous_commit=off',
      '-c',
      'full_page_writes=off',
      '-c',
      'max_connections=60',
    ],
    onLog: () => {},
    onError: (erro) => console.error('[postgres-test]', erro),
  });

  await servidor.initialise();
  await servidor.start();

  const admin = new pg.Client({
    host: HOST,
    port: porta,
    user: USER,
    password: PASSWORD,
    database: 'postgres',
  });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${DATABASE}"`);
  await admin.end();

  const url = `postgresql://${USER}:${PASSWORD}@${HOST}:${porta}/${DATABASE}`;
  const ambiente: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  delete ambiente.SHADOW_DATABASE_URL;

  try {
    execFileSync(path.resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      env: ambiente,
      stdio: 'pipe',
    });
  } catch (erro) {
    const saida = erro as { stdout?: Buffer; stderr?: Buffer };
    await servidor.stop();
    throw new Error(
      `Falha ao aplicar as migrations no banco de teste:\n${saida.stdout?.toString() ?? ''}${saida.stderr?.toString() ?? ''}`,
    );
  }

  process.env.DATABASE_URL = url;
  project.provide('databaseUrl', url);

  return async () => {
    await servidor.stop();
    rmSync(pasta, { recursive: true, force: true });
  };
}
