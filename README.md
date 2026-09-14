# Sistema Conquista Park

Sistema de venda de ingressos, portaria, bilheteria, caixa e gestão do **Conquista Park**, parque aquático em
Ubatã, Bahia.

> **Situação:** venda online completa (site, carrinho, PIX de teste, ingressos com QR Code) e painel de gestão
> (indicadores, pedidos, clientes, cupons, ingressos e preços, calendário, configurações). Próximas etapas:
> provedor de pagamento real, portaria e bilheteria. A arquitetura e o plano estão em
> [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## O que já funciona

### Site de vendas

| Página | O que faz |
|---|---|
| `/` | Apresentação do parque, próximas datas abertas, preços do dia, dúvidas frequentes |
| `/comprar` | Calendário com situação e preço de cada dia, escolha dos ingressos, vagas seguradas enquanto a pessoa preenche os dados |
| `/comprar/dados` | Dados do comprador e de cada visitante, cupom, aceite dos termos, contagem do tempo da reserva |
| `/pedido/<número>?t=<token>` | PIX (QR Code e copia e cola) com acompanhamento automático; depois do pagamento, os ingressos com QR Code |
| `/meus-ingressos` | Reenvio dos links dos pedidos para o e-mail da compra |
| `/politicas/...` e `/contato` | Cancelamento, termos, privacidade (editáveis no painel) e canais de atendimento |

Links de campanha (`utm_source`, `utm_campaign`…) e links com data ou ingresso já escolhidos (`?data=`,
`?ingresso=`) são registrados no pedido e aparecem no painel.

### Painel (`/admin`)

| Área | O que faz |
|---|---|
| Painel | Receita, pedidos, ingressos, valor médio, clientes novos, conversão, entradas e descontos, com comparação ao período anterior; vendas por dia, tipo, canal, forma de pagamento, horário e dia da visita; hoje no parque; ocupação dos próximos 14 dias; cupons e origens; últimos pedidos |
| Pedidos | Busca por número, nome, e-mail, CPF ou código do ingresso; filtros; planilha; ficha com itens, ingressos, pagamentos e histórico; cancelar, reembolsar, reenviar e-mail, gerar novo link, consultar pagamento |
| Clientes | Identificados pelo CPF (guardado só como HMAC); total em compras, pedidos, ingressos e visitas; edição e planilha |
| Cupons | Percentual ou valor fixo, teto, compra mínima, validade, datas de visita, dias da semana, limite total e por CPF, primeira compra, canais e ingressos; usos, descontos e vendas |
| Ingressos e preços | Tipos de ingresso (idade, dados dos visitantes, documento, pessoas por ingresso, cotas e limites), regras de preço por tipo de dia, período, janela de venda e lote; link da página de compra e gerador de links de campanha |
| Calendário | Mês com lotação e ocupação; configurar período (abrir ou fechar vários dias); editar dia, feriado ou evento. Dia com venda não fecha nem fica com lotação menor que o vendido |
| Configurações | Prontidão para vender, regras da venda online, dados do parque e políticas |
| Equipe, Permissões, Auditoria | Acesso por papéis (9 papéis, matriz editável), trilha imutável de todas as alterações |

### Regras que o servidor garante

- Preço, desconto e total sempre calculados no servidor, nunca aceitos do navegador.
- Lotação por dia com trava: compras simultâneas não vendem além das vagas; reserva vencida devolve a vaga sozinha.
- Cupom com limite de usos travado contra pedidos simultâneos; limites por CPF e por pedido.
- Pagamento confirmado só com a situação consultada no provedor; aviso repetido não é processado duas vezes;
  pagamento fora do prazo confirma se ainda houver vaga, senão o pedido fica marcado para devolução.
- QR Code assinado (`CP1.<código>.<assinatura>`), sem dado pessoal; link do pedido com token que pode ser revogado.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 17 · Prisma 7 · Zod · argon2 ·
pino · Radix · Recharts · Vitest · Playwright. Detalhes e motivos na
[seção 2 da arquitetura](docs/ARQUITETURA.md#2-stack).

## Rodando no computador

Pré-requisito: Node.js 22.12 ou mais novo (recomendado 24). Não precisa de Docker.

```bash
npm install
cp .env.example .env

npm run db:local      # terminal 1 — Postgres local; deixe aberto
npm run db:migrate    # terminal 2 — cria as tabelas
npm run db:seed       # equipe, ingressos, calendário, clientes, cupons e dois meses de vendas fictícias
npm run dev
```

- Site: <http://localhost:3000>. No PIX de teste, a página do pedido tem o botão **Simular pagamento aprovado**.
- Painel: <http://localhost:3000/entrar> com `admin@conquistapark.dev` e a senha `Parque-Dev-2026!` (existe só no
  banco local; o seed se recusa a rodar em qualquer outro banco e não altera dados que já existam).
- Com `EMAIL_PROVIDER=mock`, os e-mails aparecem no terminal do `npm run dev`.

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run typecheck` · `npm run lint` · `npm run format` | Qualidade de código |
| `npm run test:unit` | Regras puras: dinheiro, datas, CPF, permissões, preço, cupom, filtros, CSV |
| `npm run test:integration` | Testes com banco real (sobem um Postgres 17 descartável): compra, lotação e cupom concorrentes, webhooks, vencimento, reembolso, permissões |
| `npm run db:local` | Postgres local de desenvolvimento |
| `npm run db:migrate` | Aplica as migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Dados fictícios (só banco local) |
| `npm run access:sync` | Leva o catálogo de papéis e permissões para o banco |
| `npm run admin:create` | Cria o primeiro super admin com senha forte gerada |
| `npx tsx --conditions=react-server scripts/qa-capturas.ts` | Capturas de todas as telas no computador e no celular, apontando erro de console e página mais larga que a tela |
| `npx tsx --conditions=react-server scripts/qa-compra.ts` | Compra de ponta a ponta pela interface, até os ingressos com QR Code |

## Rotina agendada

`POST /api/cron/expire-sales` a cada 5 minutos, com o cabeçalho `Authorization: Bearer <CRON_SECRET>`. Vence
carrinhos e pedidos não pagos, libera cupons e cobranças e, antes de vencer, consulta o provedor para recuperar
pagamento cujo aviso tenha se perdido. A vaga de uma reserva vencida já é devolvida no instante do vencimento,
mesmo antes da rotina.

## Banco de dados

- Toda mudança estrutural vira migration versionada em `prisma/migrations`, revisada antes de ir para produção.
- Para criar uma migration: altere `prisma/schema.prisma` e gere o SQL com
  `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`.
  Revise o SQL. **Tabela nova precisa de `ENABLE ROW LEVEL SECURITY`** — um teste de integração falha se esquecer.
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
| `PARK_SLUG` | Parque vendido pelo site desta instalação |
| `DATABASE_URL` | Conexão da aplicação (pooler, porta 6543 no Supabase) |
| `DIRECT_URL` | Conexão direta, usada pelas migrations |
| `SHADOW_DATABASE_URL` | Banco auxiliar para criar migrations (só desenvolvimento) |
| `DB_POOL_MAX` | Conexões simultâneas por instância |
| `LOG_LEVEL` | Detalhe dos logs |
| `EMAIL_PROVIDER` · `EMAIL_FROM` · `RESEND_API_KEY` | Envio de e-mails |
| `PAYMENT_PROVIDER` | `mock` (teste). Em produção, sem provedor real, o site não vende |
| `QR_SIGNING_KEY` · `ORDER_LINK_KEY` · `CPF_HASH_KEY` · `CRON_SECRET` | Chaves do QR Code, dos links de pedido, do CPF e da rotina. Obrigatórias em produção; guarde cópia fora do servidor |

## Estrutura

```text
docs/                 arquitetura e decisões
prisma/               schema, migrations e seed (seed-vendas.ts: dados de vendas fictícios)
scripts/              Postgres local, primeiro admin, permissões, capturas e teste de compra
src/app/(site)/       site de vendas
src/app/admin/        painel
src/app/api/          rotas: admin/, public/, webhooks/, cron/
src/components/       design system (ui/), painel (admin/) e site (site/)
src/lib/              regras puras compartilhadas: dinheiro, datas, CPF, preço, cupom, pedidos, permissões
src/server/           serviços: catalog, calendar, sales, payments, orders, customers, coupons, dashboard, settings
tests/                unitários, integração e utilitários de teste
```

## Plano

| Fase | Entrega | Situação |
|---|---|---|
| 1 | Base técnica, autenticação, banco e design system | Concluída |
| 2 | Datas, capacidades e tipos de ingresso | Concluída |
| 3 | Site, carrinho e checkout | Concluída |
| 4 | Pedidos e pagamentos | Concluída com PIX de teste; falta o provedor real (Asaas) |
| 5 | Emissão e QR Code | QR assinado, página e e-mail concluídos; faltam troca de titular e reemissão |
| 6 | Portaria e check-in | Próxima |
| 7 | Dashboard e relatórios | Painel de vendas concluído; relatórios detalhados em aberto |
| 8 | Financeiro, bilheteria e caixa | — |
| 9 | WhatsApp e e-mail | E-mails de pedido prontos; WhatsApp em aberto |
| 10 | Auditoria, segurança e melhorias | — |
| 11 | Testes, otimização e produção | — |

---

Uso restrito ao Conquista Park.
