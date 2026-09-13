/**
 * Postgres local para desenvolvimento — sem Docker.
 *
 *   npm run db:local        sobe o servidor e fica rodando (Ctrl+C para parar)
 *
 * Usa o binário oficial do Postgres 17 (pacote embedded-postgres), guarda os
 * dados em .data/postgres e só escuta em 127.0.0.1. Cria os bancos
 * sistemapark_dev e sistemapark_shadow. Os testes de integração sobem um
 * servidor próprio e descartável (tests/helpers/global-setup.ts).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const HOST = '127.0.0.1';
const PORT = 54329;
const USER = 'postgres';
const PASSWORD = 'postgres-local';
const DATA_DIR = path.resolve('.data/postgres');
const BANCOS = ['sistemapark_dev', 'sistemapark_shadow'];

function url(banco: string): string {
  return `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/${banco}`;
}

async function main(): Promise<void> {
  const servidor = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
    user: USER,
    password: PASSWORD,
    authMethod: 'scram-sha-256',
    persistent: true,
    postgresFlags: ['-c', `listen_addresses=${HOST}`, '-c', 'timezone=UTC', '-c', 'max_connections=40'],
    onLog: () => {},
    onError: (erro) => console.error('[postgres]', erro),
  });

  if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    console.log('Inicializando o Postgres local em .data/postgres…');
    await servidor.initialise();
  }
  await servidor.start();

  const cliente = new pg.Client({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: 'postgres',
  });
  await cliente.connect();
  for (const banco of BANCOS) {
    const existe = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [banco]);
    if (existe.rowCount === 0) await cliente.query(`CREATE DATABASE "${banco}"`);
  }
  await cliente.end();

  console.log(`
Postgres local rodando em ${HOST}:${PORT}. Coloque no .env:

  DATABASE_URL="${url('sistemapark_dev')}"
  DIRECT_URL="${url('sistemapark_dev')}"
  SHADOW_DATABASE_URL="${url('sistemapark_shadow')}"

Ctrl+C para parar.`);

  let parando = false;
  const parar = async () => {
    if (parando) return;
    parando = true;
    await servidor.stop();
    process.exit(0);
  };
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exit(1);
});
