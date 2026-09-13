import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuração do Prisma CLI (generate, migrations, seed).
 *
 * As migrations usam a conexão direta (`DIRECT_URL`): o pooler do Supabase em
 * modo transação não serve para DDL. A aplicação usa `DATABASE_URL` (com pool)
 * em `src/server/db.ts`.
 *
 * Em produção só se usa `prisma migrate deploy`. `migrate dev`, `migrate reset`
 * e `db push` nunca apontam para o banco de produção.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --conditions=react-server prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
