import { ChevronRight, Download, Megaphone, Repeat, Search, UserPlus, UsersRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { NewCustomerDialog } from '@/components/admin/customers/edit-customer-dialog';
import { MetricCard } from '@/components/admin/metric-card';
import { NoPermission } from '@/components/admin/no-permission';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Checkbox, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { CUSTOMER_SORT_LABELS, CUSTOMER_SORTS } from '@/lib/customers';
import { formatDateBR } from '@/lib/dates';
import { formatPhoneBR } from '@/lib/documents';
import { formatNumber, formatPercent } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import {
  getCustomerSummary,
  listCustomers,
  type CustomerListFilters,
  type CustomerListItem,
} from '@/server/customers/service';
import { parseCustomerFilters, type SearchParamsRecord } from '@/server/filters';

export const metadata: Metadata = { title: 'Clientes' };

function consulta(filtros: CustomerListFilters, pagina?: number): string {
  const busca = new URLSearchParams();
  if (filtros.q) busca.set('q', filtros.q);
  if (filtros.sort && filtros.sort !== 'recentes') busca.set('ordem', filtros.sort);
  if (filtros.marketing) busca.set('comunicacoes', 'sim');
  if (pagina && pagina > 1) busca.set('pagina', String(pagina));
  return busca.toString();
}

function ultimaVisita(cliente: CustomerListItem): string {
  if (cliente.lastVisitDate) return formatDateBR(cliente.lastVisitDate);
  if (cliente.nextVisitDate) return `Marcada para ${formatDateBR(cliente.nextVisitDate)}`;
  return 'Nenhuma visita';
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const auth = await requirePageAuth();
  if (!can(auth, 'customers.view')) return <NoPermission />;

  const filtros = parseCustomerFilters(await searchParams);
  const [resultado, resumo] = await Promise.all([listCustomers(auth, filtros), getCustomerSummary(auth)]);
  const filtrando = Boolean(filtros.q || filtros.marketing);
  const filtrosDaPlanilha = consulta({ ...filtros, page: undefined });
  const hrefPagina = (pagina: number) => {
    const texto = consulta(filtros, pagina);
    return texto ? `/admin/clientes?${texto}` : '/admin/clientes';
  };
  const parte = (valor: number) => (resumo.total > 0 ? formatPercent(valor / resumo.total) : '0%');

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Clientes"
        description="Quem compra ingressos: contato, compras, ingressos, visitas e total gasto."
        actions={
          <>
            {can(auth, 'customers.export') ? (
              <a
                href={`/api/admin/customers/export${filtrosDaPlanilha ? `?${filtrosDaPlanilha}` : ''}`}
                className={buttonClasses('secondary')}
              >
                <Download className="size-4" aria-hidden />
                Exportar planilha
              </a>
            ) : null}
            {can(auth, 'customers.manage') ? <NewCustomerDialog /> : null}
          </>
        }
      />

      <section
        aria-label="Resumo dos clientes"
        className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard label="Clientes cadastrados" value={formatNumber(resumo.total)} icon={UsersRound} />
        <MetricCard
          label="Novos em 30 dias"
          value={formatNumber(resumo.newLast30Days)}
          hint="Cadastrados no período"
          icon={UserPlus}
          tone="citrus"
        />
        <MetricCard
          label="Voltaram a comprar"
          value={formatNumber(resumo.returning)}
          hint={`${parte(resumo.returning)} dos clientes, com 2 ou mais compras pagas`}
          icon={Repeat}
          tone="grape"
        />
        <MetricCard
          label="Aceitam comunicações"
          value={formatNumber(resumo.marketingOptIn)}
          hint={`${parte(resumo.marketingOptIn)} autorizaram novidades e promoções`}
          icon={Megaphone}
          tone="sun"
        />
      </section>

      <form
        role="search"
        className="grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto] md:items-center"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={filtros.q}
            placeholder="Nome, CPF, WhatsApp ou e-mail"
            aria-label="Buscar cliente"
            className="pl-10"
          />
        </div>
        <Select name="ordem" defaultValue={filtros.sort ?? 'recentes'} aria-label="Ordenar por">
          {CUSTOMER_SORTS.map((ordem) => (
            <option key={ordem} value={ordem}>
              {CUSTOMER_SORT_LABELS[ordem]}
            </option>
          ))}
        </Select>
        <label className="flex cursor-pointer items-center gap-2.5 whitespace-nowrap px-1 text-sm text-ink-700">
          <Checkbox name="comunicacoes" value="sim" defaultChecked={filtros.marketing === true} />
          Só quem aceita comunicações
        </label>
        <div className="flex gap-2">
          <button type="submit" className={buttonClasses('primary', 'md', 'flex-1 md:flex-none')}>
            Filtrar
          </button>
          {filtrando || filtros.sort ? (
            <Link href="/admin/clientes" className={buttonClasses('ghost', 'md', 'flex-1 md:flex-none')}>
              Limpar
            </Link>
          ) : null}
        </div>
      </form>

      {resultado.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title={filtrando ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
            description={
              filtrando
                ? 'Confira o nome, o CPF, o WhatsApp ou o e-mail digitado.'
                : 'O cliente entra no cadastro na primeira compra, ou pelo botão Novo cliente.'
            }
          />
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 lg:hidden">
            {resultado.items.map((cliente) => (
              <li key={cliente.id}>
                <Link
                  href={`/admin/clientes/${cliente.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70 active:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-ink-900">{cliente.name}</p>
                      <p className="tabular shrink-0 text-sm font-semibold text-ink-900">
                        {formatBRL(cliente.totalSpentCents)}
                      </p>
                    </div>
                    <p className="truncate text-[13px] text-ink-500">
                      {[cliente.phone ? formatPhoneBR(cliente.phone) : null, cliente.email]
                        .filter(Boolean)
                        .join(' · ') || 'Sem contato'}
                    </p>
                    <p className="text-[13px] text-ink-500">
                      {formatNumber(cliente.visitsCount)} {cliente.visitsCount === 1 ? 'visita' : 'visitas'} ·{' '}
                      {ultimaVisita(cliente)}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <TableContainer className="hidden lg:block">
            <Table>
              <THead>
                <tr>
                  <TH>Cliente</TH>
                  <TH>CPF</TH>
                  <TH>WhatsApp</TH>
                  <TH className="text-right">Visitas</TH>
                  <TH className="text-right">Total gasto</TH>
                  <TH>Última visita</TH>
                  <TH className="w-10">
                    <span className="sr-only">Abrir</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {resultado.items.map((cliente) => (
                  <TR key={cliente.id} className="hover:bg-pool-50/40">
                    <TD className="max-w-72">
                      <Link
                        href={`/admin/clientes/${cliente.id}`}
                        className="block truncate font-semibold text-ink-900 hover:text-pool-800"
                      >
                        {cliente.name}
                      </Link>
                      <p className="truncate text-xs text-ink-500">{cliente.email ?? 'Sem e-mail'}</p>
                    </TD>
                    <TD className="whitespace-nowrap text-ink-600">
                      {cliente.cpfMasked ?? <span className="text-ink-400">Não informado</span>}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {cliente.phone ? (
                        <a
                          href={`https://wa.me/${cliente.phone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ink-700 hover:text-success-700"
                        >
                          {formatPhoneBR(cliente.phone)}
                        </a>
                      ) : (
                        <span className="text-ink-400">Sem WhatsApp</span>
                      )}
                    </TD>
                    <TD className="tabular text-right">{formatNumber(cliente.visitsCount)}</TD>
                    <TD className="whitespace-nowrap text-right">
                      <p className="tabular font-semibold text-ink-900">
                        {formatBRL(cliente.totalSpentCents)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatNumber(cliente.ordersCount)} {cliente.ordersCount === 1 ? 'compra' : 'compras'}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap text-ink-600">{ultimaVisita(cliente)}</TD>
                    <TD>
                      <Link
                        href={`/admin/clientes/${cliente.id}`}
                        className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        aria-label={`Abrir ${cliente.name}`}
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>

          <Pagination
            page={resultado.page}
            pageSize={resultado.pageSize}
            total={resultado.total}
            hrefFor={hrefPagina}
          />
        </>
      )}
    </div>
  );
}
