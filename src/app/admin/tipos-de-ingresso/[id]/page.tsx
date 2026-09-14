import { ArrowLeft, Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { NoPermission } from '@/components/admin/no-permission';
import { SalesLink } from '@/components/admin/sales-link';
import { DeletePriceRuleButton, PriceRuleDialog } from '@/components/admin/tickets/price-rule-dialog';
import { TicketTypeFormDialog } from '@/components/admin/tickets/ticket-type-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { HOLDER_DATA_LABELS, SALES_CHANNEL_LABELS, TICKET_CATEGORY_LABELS } from '@/lib/catalog';
import { formatDateBR } from '@/lib/dates';
import { formatNumber, plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { DAY_KIND_LABELS } from '@/lib/pricing';
import { uuidSchema } from '@/lib/validation';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getTicketTypeAdmin, type AdminPriceRule, type AdminTicketType } from '@/server/catalog/service';
import { env } from '@/server/env';
import { isAppError } from '@/server/errors';

export const metadata: Metadata = { title: 'Tipo de ingresso' };

function intervalo(de: string | null, ate: string | null, vazio: string): string {
  if (de && ate) return `${formatDateBR(de)} a ${formatDateBR(ate)}`;
  if (de) return `A partir de ${formatDateBR(de)}`;
  if (ate) return `Até ${formatDateBR(ate)}`;
  return vazio;
}

function condicoes(regra: AdminPriceRule): string[] {
  const lista: string[] = [];
  lista.push(
    regra.dayKinds.length > 0
      ? regra.dayKinds.map((tipo) => DAY_KIND_LABELS[tipo]).join(', ')
      : 'Qualquer dia',
  );
  if (regra.visitFrom || regra.visitUntil)
    lista.push(`Visitas: ${intervalo(regra.visitFrom, regra.visitUntil, '')}`);
  if (regra.saleFrom || regra.saleUntil)
    lista.push(`Vendas: ${intervalo(regra.saleFrom, regra.saleUntil, '')}`);
  return lista;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-ink-500">{rotulo}</dt>
      <dd className="text-right font-medium text-ink-900">{valor}</dd>
    </div>
  );
}

function faixa(tipo: AdminTicketType): string {
  if (tipo.minAge !== null && tipo.maxAge !== null) return `${tipo.minAge} a ${tipo.maxAge} anos`;
  if (tipo.maxAge !== null) return `Até ${tipo.maxAge} anos`;
  if (tipo.minAge !== null) return `A partir de ${tipo.minAge} anos`;
  return 'Qualquer idade';
}

export default async function IngressoPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  if (!can(auth, 'ticket_types.view')) return <NoPermission />;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let tipo: AdminTicketType;
  try {
    tipo = await getTicketTypeAdmin(auth, id);
  } catch (erro) {
    if (isAppError(erro) && erro.code === 'NOT_FOUND') notFound();
    throw erro;
  }

  const podeEditar = can(auth, 'ticket_types.manage');
  const podePrecificar = can(auth, 'ticket_types.manage');
  const linkDoIngresso = `${env().APP_URL}/comprar?ingresso=${tipo.slug}`;

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/tipos-de-ingresso"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Tipos de ingresso
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-pool-700">Tipo de ingresso</p>
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[30px]">
            {tipo.name}
          </h1>
          {tipo.description ? <p className="mt-1 text-sm text-ink-600">{tipo.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="info">{TICKET_CATEGORY_LABELS[tipo.category]}</Badge>
            <Badge tone={tipo.isActive ? 'success' : 'neutral'} dot>
              {tipo.isActive ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </div>
        {podeEditar ? (
          <TicketTypeFormDialog
            ticketType={{
              id: tipo.id,
              name: tipo.name,
              description: tipo.description,
              category: tipo.category,
              basePriceCents: tipo.basePriceCents,
              minAge: tipo.minAge,
              maxAge: tipo.maxAge,
              holderData: tipo.holderData,
              requiresDocument: tipo.requiresDocument,
              documentHint: tipo.documentHint,
              occupiesCapacity: tipo.occupiesCapacity,
              peoplePerTicket: tipo.peoplePerTicket,
              dailyQuota: tipo.dailyQuota,
              minPerOrder: tipo.minPerOrder,
              maxPerOrder: tipo.maxPerOrder,
              maxPerCustomerPerDay: tipo.maxPerCustomerPerDay,
              channels: tipo.channels,
              availableFrom: tipo.availableFrom,
              availableUntil: tipo.availableUntil,
              rulesText: tipo.rulesText,
              isActive: tipo.isActive,
            }}
          />
        ) : null}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        <div className="grid gap-6">
          <Card>
            <CardHeader title="Preço" />
            <CardContent className="pt-3">
              <p className="text-xs font-semibold text-ink-500">Para hoje</p>
              <p className="tabular font-display text-3xl font-semibold text-ink-900">
                {tipo.todayPrice.priceCents === 0 ? 'Gratuito' : formatBRL(tipo.todayPrice.priceCents)}
              </p>
              <p className="text-[13px] text-ink-500">
                {tipo.todayPrice.label
                  ? `Regra: ${tipo.todayPrice.label}`
                  : 'Preço base, nenhuma regra vale hoje'}
              </p>
              <dl className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
                <Linha rotulo="Preço base" valor={formatBRL(tipo.basePriceCents)} />
                <Linha rotulo="Vendidos" valor={formatNumber(tipo.soldUnits)} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Regras de uso e venda" />
            <CardContent className="pt-2">
              <dl className="divide-y divide-ink-100">
                <Linha
                  rotulo="Onde vende"
                  valor={tipo.channels.map((canal) => SALES_CHANNEL_LABELS[canal]).join(' e ')}
                />
                <Linha rotulo="Idade" valor={faixa(tipo)} />
                <Linha rotulo="Dados de cada visitante" valor={HOLDER_DATA_LABELS[tipo.holderData]} />
                <Linha
                  rotulo="Documento na entrada"
                  valor={tipo.requiresDocument ? (tipo.documentHint ?? 'Sim') : 'Não exige'}
                />
                <Linha rotulo="Pessoas por ingresso" valor={formatNumber(tipo.peoplePerTicket)} />
                <Linha rotulo="Lotação" valor={tipo.occupiesCapacity ? 'Ocupa vaga' : 'Não ocupa vaga'} />
                <Linha
                  rotulo="Limite por dia"
                  valor={tipo.dailyQuota !== null ? formatNumber(tipo.dailyQuota) : 'Só a lotação'}
                />
                <Linha
                  rotulo="Por pedido"
                  valor={
                    tipo.minPerOrder !== null || tipo.maxPerOrder !== null
                      ? `${tipo.minPerOrder ?? 1} a ${tipo.maxPerOrder ?? 'sem máximo'}`
                      : 'Sem limite próprio'
                  }
                />
                <Linha
                  rotulo="Por CPF na data"
                  valor={
                    tipo.maxPerCustomerPerDay !== null
                      ? formatNumber(tipo.maxPerCustomerPerDay)
                      : 'Sem limite'
                  }
                />
                <Linha
                  rotulo="Datas de visita"
                  valor={intervalo(tipo.availableFrom, tipo.availableUntil, 'Qualquer data aberta')}
                />
              </dl>
              {tipo.rulesText ? (
                <p className="mt-3 whitespace-pre-line rounded-xl bg-ink-50 px-4 py-3 text-[13px] leading-6 text-ink-700">
                  {tipo.rulesText}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {tipo.channels.includes('ONLINE') && tipo.isActive ? (
            <Card>
              <CardHeader
                title="Link com este ingresso"
                description="Abre a compra com este ingresso já selecionado."
              />
              <CardContent className="pt-3">
                <SalesLink url={linkDoIngresso} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <section className="grid gap-3" aria-labelledby="regras-de-preco">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="regras-de-preco" className="font-display text-[17px] font-semibold text-ink-900">
                Regras de preço
              </h2>
              <p className="text-[13px] text-ink-500">
                {tipo.prices.length === 0
                  ? 'Sem regras: o preço base vale para todas as datas.'
                  : plural(tipo.prices.length, 'regra cadastrada', 'regras cadastradas')}
              </p>
            </div>
            {podePrecificar ? <PriceRuleDialog ticketTypeId={tipo.id} /> : null}
          </div>

          <div className="flex gap-3 rounded-xl bg-pool-50 px-4 py-3 text-[13px] leading-5 text-pool-900 ring-1 ring-inset ring-pool-200">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Entre as regras ativas que valem para a data e o momento da compra, vence a de maior prioridade.
              Empatando, vence a do tipo marcado no calendário (feriado, evento), depois a do dia da semana,
              depois a geral. Lote esgotado deixa de valer sozinho.
            </p>
          </div>

          {tipo.prices.length > 0 ? (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Regra</TH>
                    <TH className="text-right">Preço</TH>
                    <TH>Quando vale</TH>
                    <TH className="text-right">Lote</TH>
                    <TH className="text-right">Prioridade</TH>
                    {podePrecificar ? (
                      <TH>
                        <span className="sr-only">Ações</span>
                      </TH>
                    ) : null}
                  </tr>
                </THead>
                <TBody>
                  {tipo.prices.map((regra) => (
                    <TR key={regra.id} className={regra.isActive ? undefined : 'bg-ink-50/60 text-ink-500'}>
                      <TD>
                        <p className="font-medium text-ink-900">{regra.name}</p>
                        {regra.isActive ? null : <Badge tone="neutral">Inativa</Badge>}
                        {tipo.todayPrice.ruleId === regra.id ? (
                          <Badge tone="success">Valendo hoje</Badge>
                        ) : null}
                      </TD>
                      <TD className="whitespace-nowrap text-right">
                        <p className="tabular font-semibold">{formatBRL(regra.priceCents)}</p>
                        {regra.compareAtCents ? (
                          <p className="tabular text-xs text-ink-400 line-through">
                            {formatBRL(regra.compareAtCents)}
                          </p>
                        ) : null}
                      </TD>
                      <TD className="text-[13px] text-ink-600">
                        {condicoes(regra).map((condicao) => (
                          <p key={condicao}>{condicao}</p>
                        ))}
                      </TD>
                      <TD className="tabular whitespace-nowrap text-right text-[13px]">
                        {regra.lotQuantity !== null
                          ? `${formatNumber(regra.lotSold ?? 0)} / ${formatNumber(regra.lotQuantity)}`
                          : 'Sem lote'}
                      </TD>
                      <TD className="tabular text-right">{regra.priority}</TD>
                      {podePrecificar ? (
                        <TD>
                          <div className="flex justify-end gap-1">
                            <PriceRuleDialog
                              ticketTypeId={tipo.id}
                              rule={{
                                id: regra.id,
                                name: regra.name,
                                priceCents: regra.priceCents,
                                compareAtCents: regra.compareAtCents,
                                dayKinds: regra.dayKinds,
                                visitFrom: regra.visitFrom,
                                visitUntil: regra.visitUntil,
                                saleFrom: regra.saleFrom,
                                saleUntil: regra.saleUntil,
                                lotQuantity: regra.lotQuantity,
                                lotSold: regra.lotSold,
                                priority: regra.priority,
                                isActive: regra.isActive,
                              }}
                            />
                            <DeletePriceRuleButton ruleId={regra.id} name={regra.name} />
                          </div>
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          ) : null}
        </section>
      </div>
    </div>
  );
}
