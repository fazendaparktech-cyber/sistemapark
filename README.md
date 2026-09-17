# Sistema Conquista Park

Venda de ingressos e gestão do **Conquista Park**, parque aquático em Ubatã, Bahia: site de compra com PIX e
QR Code, portaria, venda no balcão e painel administrativo.

## Sumário

- [Visão geral](#visão-geral)
- [Tecnologias](#tecnologias)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como rodar localmente](#como-rodar-localmente)
- [Comandos](#comandos)
- [Banco de dados](#banco-de-dados)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Publicação](#publicação)
- [Pendências para produção](#pendências-para-produção)

## Visão geral

### Site do cliente

| Rota | Função |
|---|---|
| `/` | Apresentação do parque, ingresso único, próximas datas e dúvidas frequentes |
| `/comprar` | Calendário de datas abertas, quantidade de ingressos e vagas reservadas durante a compra |
| `/comprar/dados` | Dados do comprador e dos visitantes, cupom e aceite dos termos |
| `/pedido/<número>` | Pagamento PIX e, após a confirmação, ingressos com QR Code |
| `/meus-ingressos` | Consulta dos ingressos comprados |
| `/politicas`, `/contato` | Termos, privacidade, cancelamento e contato |

### Painel administrativo (`/admin`)

| Seção | Função |
|---|---|
| Dashboard | Faturamento, vendas, visitantes, ocupação e últimas vendas |
| Vendas | Pedidos online e no balcão, cancelamento, reembolso e reenvio |
| Ingressos | Busca de ingressos e QR Codes |
| Clientes | Cadastro, histórico e perfil do público (cidades, regiões e idades) |
| Tipos de ingresso | Preço, regras e disponibilidade |
| Cupons | Descontos com limite de uso, datas e canais |
| Calendário | Dias abertos, horários, capacidade e preços especiais, com configuração por período |
| Portaria / Check-in | Leitura de QR Code e entrada manual |
| Financeiro | Receitas x despesas, métricas de ingressos e lançamentos |
| Relatórios | Vendas, faturamento, pagamentos, visitantes, cupons e origem, com exportação CSV e Excel |
| Marketing / Rastreamento | Funil de compra, origem das vendas (UTM) e pixels |
| Atividades | Registro das ações feitas no sistema |
| Configurações | Parque, funcionamento, vendas online, pagamentos, políticas, comunicação, integrações e conta |

## Tecnologias

Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Prisma 7, PostgreSQL 17, Vitest e
Recharts.

## Estrutura do projeto

```text
prisma/              schema, migrations e seeds
scripts/             banco local, conta do painel, permissões e roteiros de QA
src/app/(site)/      páginas públicas de compra
src/app/admin/       painel administrativo
src/app/api/         rotas da API
src/components/      componentes de interface (site, admin e ui)
src/lib/             regras compartilhadas entre servidor e navegador
src/server/          regras de negócio por módulo (vendas, pagamentos, financeiro, portaria...)
src/proxy.ts         segurança das rotas e cabeçalhos (CSP)
tests/               testes unitários e de integração
docs/                arquitetura e decisões
```

## Como rodar localmente

```bash
npm install
cp .env.example .env     # preencha as chaves locais
npm run db:local         # sobe o PostgreSQL local (deixe este terminal aberto)
npm run db:migrate       # aplica as migrations
npm run db:seed          # dados de exemplo
npm run admin:create     # cria a conta do painel
npm run dev              # http://localhost:3000
```

## Comandos

| Comando | Função |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm run start` | Build e execução de produção |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run test` | Todos os testes (`test:unit` e `test:integration` separados) |
| `npm run db:local` | PostgreSQL local de desenvolvimento |
| `npm run db:migrate` | Aplica as migrations |
| `npm run db:generate` | Gera o cliente do Prisma |
| `npm run db:seed` | Dados de exemplo (somente desenvolvimento) |
| `npm run access:sync` | Sincroniza permissões e perfis com o banco |
| `npm run admin:create` | Cria a conta de acesso ao painel |

## Banco de dados

- Migrations em `prisma/migrations`, aplicadas com `npm run db:migrate`.
- Todas as tabelas com RLS ativo: o acesso aos dados acontece somente pelo servidor.
- Valores em centavos e datas no fuso `America/Bahia`.
- Nunca rode seed, testes ou scripts de escrita em banco de produção.

## Variáveis de ambiente

Modelo em [`.env.example`](.env.example). Nunca coloque chaves reais no repositório.

| Variável | Uso |
|---|---|
| `APP_URL` | Endereço público do sistema |
| `PARK_SLUG` | Identificador do parque |
| `DATABASE_URL` | Conexão com o banco (pool) |
| `DIRECT_URL` | Conexão direta, usada nas migrations |
| `SHADOW_DATABASE_URL` | Banco auxiliar do Prisma em desenvolvimento |
| `DB_POOL_MAX` | Limite de conexões |
| `LOG_LEVEL` | Nível de log |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` | Envio de e-mails |
| `PAYMENT_PROVIDER` | Provedor de pagamento (`mock` em desenvolvimento) |
| `QR_SIGNING_KEY`, `ORDER_LINK_KEY`, `CPF_HASH_KEY` | Chaves de segurança (valores longos e aleatórios) |
| `CRON_SECRET` | Autenticação das tarefas agendadas |

## Publicação

1. Banco PostgreSQL no Supabase (região São Paulo).
2. Variáveis de ambiente configuradas no provedor de hospedagem.
3. A cada publicação: `npm run db:migrate` e `npm run access:sync`.

## Pendências para produção

- Projeto Supabase próprio do sistema
- Provedor de PIX real (Asaas)
- Provedor de e-mail (Resend)
- Domínio com HTTPS
- Dados reais do parque e revisão das políticas
- Aviso de cookies (LGPD) antes de ativar os pixels

A arquitetura detalhada está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).
