# Sistema Conquista Park

Sistema de venda de ingressos, portaria, bilheteria, caixa e gestão do **Conquista Park**, parque aquático em
Ubatã, Bahia.

> **Situação:** fase 1 de 11 — base técnica, autenticação, banco e design system.
> A arquitetura completa e o plano estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## O que já funciona

| Área | O que faz |
|---|---|
| Acesso da equipe | Login, recuperação de senha por e-mail (link de uso único), troca obrigatória da senha temporária, limite de tentativas |
| Equipe | Cadastro com senha temporária, papéis, suspender, desativar, reativar, gerar nova senha, encerrar sessões |
| Permissões | 9 papéis com matriz padrão, editável pelo painel, conferida no servidor em toda ação |
| Auditoria | Todo login, tentativa recusada e alteração de acesso, com antes e depois; registros imutáveis |
| Visão geral | Equipe ativa, pessoas conectadas, atividade e prontidão da configuração |
| Base técnica | Formato único de erro, logs JSON sem dados sensíveis, CSP com nonce, verificação de origem, `/api/health` |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 17 · Prisma 7 · Zod · argon2 ·
pino · Radix · Vitest. Detalhes e motivos na [seção 2 da arquitetura](docs/ARQUITETURA.md#2-stack).

## Rodando no computador

Pré-requisito: Node.js 22.12 ou mais novo (recomendado 24). Não precisa de Docker.

```bash
npm install
cp .env.example .env

npm run db:local      # terminal 1 — Postgres local; deixe aberto
npm run db:migrate    # terminal 2 — cria as tabelas
npm run db:seed       # equipe fictícia de desenvolvimento
npm run dev
```

Abra <http://localhost:3000/entrar> e entre com `admin@conquistapark.dev` e a senha `Parque-Dev-2026!`
(existe só no banco local; o seed se recusa a rodar em qualquer outro banco).

Com `EMAIL_PROVIDER=mock`, os e-mails (como o de redefinição de senha) aparecem no terminal do `npm run dev`.

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run typecheck` · `npm run lint` · `npm run format` | Qualidade de código |
| `npm run test:unit` | Testes de regras puras (dinheiro, datas, CPF, permissões) |
| `npm run test:integration` | Testes com banco real — sobem um Postgres 17 descartável |
| `npm run db:local` | Postgres local de desenvolvimento |
| `npm run db:migrate` | Aplica as migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Dados fictícios (só banco local) |
| `npm run access:sync` | Leva o catálogo de papéis e permissões para o banco |
| `npm run admin:create` | Cria o primeiro super admin com senha forte gerada |

## Banco de dados

- Toda mudança estrutural vira migration versionada em `prisma/migrations`, revisada antes de ir para produção.
- Para criar uma migration: altere `prisma/schema.prisma` e rode, com o Postgres local ligado,
  `npx prisma migrate dev --create-only --name descricao`. Revise o SQL. **Tabela nova precisa de
  `ENABLE ROW LEVEL SECURITY`** — um teste de integração falha se esquecer.
- Regras que o Prisma não expressa (CHECK, triggers, RLS) ficam no SQL da migration.
- Em produção só se usa `npm run db:migrate`. Nunca `prisma migrate reset`, `prisma migrate dev` ou `prisma db push`
  apontando para produção.
- Os testes de integração só conectam em Postgres local com banco `*_test` — há uma trava no código.

## Primeiro acesso em produção

Com `DATABASE_URL` e `DIRECT_URL` do banco de produção configurados:

```bash
npm run db:migrate
npm run access:sync -- --confirmar-banco <host-do-banco>
npm run admin:create -- --nome "Nome Completo" --email pessoa@dominio.com.br --confirmar-banco <host-do-banco>
```

O último comando mostra uma senha temporária uma única vez; no primeiro login o sistema pede uma senha nova.
Scripts que gravam em banco que não é local exigem `--confirmar-banco` com o host exato.

## Variáveis de ambiente

Todas estão documentadas em [`.env.example`](.env.example). O sistema valida a configuração ao iniciar e não sobe
se faltar algo. Segredos nunca vão para o repositório.

| Variável | Uso |
|---|---|
| `APP_URL` | Endereço público (https em produção) |
| `DATABASE_URL` | Conexão da aplicação (pooler, porta 6543 no Supabase) |
| `DIRECT_URL` | Conexão direta, usada pelas migrations |
| `SHADOW_DATABASE_URL` | Banco auxiliar para criar migrations (só desenvolvimento) |
| `DB_POOL_MAX` | Conexões simultâneas por instância |
| `LOG_LEVEL` | Detalhe dos logs |
| `EMAIL_PROVIDER` · `EMAIL_FROM` · `RESEND_API_KEY` | Envio de e-mails |

## Estrutura

```text
docs/                 arquitetura e decisões
prisma/               schema, migrations e seed
scripts/              Postgres local, primeiro admin, sincronização de permissões
src/app/              páginas e rotas de API (site, painel, acesso da equipe)
src/components/       design system (ui/) e componentes por área
src/lib/              regras puras compartilhadas: dinheiro, datas, CPF, permissões
src/server/           serviços de domínio, autenticação, auditoria, integrações
tests/                unitários, integração e utilitários de teste
```

## Plano

| Fase | Entrega | Situação |
|---|---|---|
| 1 | Base técnica, autenticação, banco e design system | Concluída |
| 2 | Datas, capacidades e tipos de ingresso | Próxima |
| 3 | Site, carrinho e checkout | — |
| 4 | Pedidos e pagamentos | — |
| 5 | Emissão e QR Code | — |
| 6 | Portaria e check-in | — |
| 7 | Dashboard e relatórios | — |
| 8 | Financeiro, bilheteria e caixa | — |
| 9 | WhatsApp e e-mail | — |
| 10 | Auditoria, segurança e melhorias | — |
| 11 | Testes, otimização e produção | — |

---

Uso restrito ao Conquista Park.
