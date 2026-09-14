import { ChevronRight, Search, Users } from 'lucide-react';
import Link from 'next/link';

import { StaffStatusBadge } from '@/components/admin/team/staff-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import type { UserStatus } from '@/generated/prisma/enums';
import { isRoleKey, ROLE_DEFINITIONS, roleDefinition, SUPER_ADMIN_ROLE } from '@/lib/access';
import { formatDateTimeBR } from '@/lib/dates';
import { formatRelativeTime } from '@/lib/relative-time';
import type { AuthContext } from '@/server/auth/context';
import type { SearchParamsRecord } from '@/server/filters';
import { listUsers } from '@/server/users/service';

const SITUACOES: { value: UserStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativos' },
  { value: 'SUSPENDED', label: 'Suspensos' },
  { value: 'DISABLED', label: 'Desativados' },
];

function texto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
}

/** Aba Equipe: quem acessa o sistema, com filtros por nome, situação e perfil. */
export async function AbaEquipe({ auth, parametros }: { auth: AuthContext; parametros: SearchParamsRecord }) {
  const q = texto(parametros.q)?.slice(0, 100);
  const statusBruto = texto(parametros.status);
  const status = SITUACOES.some((s) => s.value === statusBruto) ? (statusBruto as UserStatus) : undefined;
  const papelBruto = texto(parametros.role);
  const role = papelBruto && isRoleKey(papelBruto) ? papelBruto : undefined;
  const page = Math.max(1, Math.min(10_000, Number(texto(parametros.page)) || 1));

  const resultado = await listUsers(auth, { q, status, role, page });

  const filtrando = Boolean(q || status || role);
  const hrefPagina = (pagina: number) => {
    const busca = new URLSearchParams();
    if (q) busca.set('q', q);
    if (status) busca.set('status', status);
    if (role) busca.set('role', role);
    if (pagina > 1) busca.set('page', String(pagina));
    const consulta = busca.toString();
    return consulta ? `/admin/usuarios?${consulta}` : '/admin/usuarios';
  };

  return (
    <>
      <form role="search" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_200px_auto]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar por nome ou e-mail"
            className="pl-10"
          />
        </div>
        <Select name="status" defaultValue={status ?? ''} aria-label="Situação">
          <option value="">Todas as situações</option>
          {SITUACOES.map((situacao) => (
            <option key={situacao.value} value={situacao.value}>
              {situacao.label}
            </option>
          ))}
        </Select>
        <Select name="role" defaultValue={role ?? ''} aria-label="Perfil">
          <option value="">Todos os perfis</option>
          {ROLE_DEFINITIONS.map((papel) => (
            <option key={papel.key} value={papel.key}>
              {papel.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {resultado.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={filtrando ? 'Ninguém encontrado' : 'Nenhuma pessoa cadastrada'}
            description={
              filtrando
                ? 'Tente outro nome, e-mail ou filtro.'
                : 'Cadastre a equipe para dar acesso ao sistema.'
            }
            action={
              filtrando ? (
                <Link
                  href="/admin/usuarios"
                  className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                >
                  Limpar filtros
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          {/* Celular: lista em cartões */}
          <ul className="grid gap-3 sm:hidden">
            {resultado.items.map((pessoa) => (
              <li key={pessoa.id}>
                <Link
                  href={`/admin/usuarios/${pessoa.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70 active:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-900">{pessoa.name}</p>
                    <p className="truncate text-[13px] text-ink-500">{pessoa.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StaffStatusBadge status={pessoa.status} />
                      {pessoa.roles.map((papel) => (
                        <Badge key={papel}>{roleDefinition(papel).name}</Badge>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          {/* Computador: tabela */}
          <TableContainer className="hidden sm:block">
            <Table>
              <THead>
                <tr>
                  <TH>Pessoa</TH>
                  <TH>Perfis</TH>
                  <TH>Situação</TH>
                  <TH>Último acesso</TH>
                  <TH className="w-10">
                    <span className="sr-only">Abrir</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {resultado.items.map((pessoa) => (
                  <TR key={pessoa.id} className="hover:bg-pool-50/40">
                    <TD>
                      <Link
                        href={`/admin/usuarios/${pessoa.id}`}
                        className="font-semibold text-ink-900 hover:text-pool-800"
                      >
                        {pessoa.name}
                      </Link>
                      <p className="text-[13px] text-ink-500">{pessoa.email}</p>
                    </TD>
                    <TD>
                      <div className="flex max-w-xs flex-wrap gap-1.5">
                        {pessoa.roles.map((papel) => (
                          <Badge key={papel} tone={papel === SUPER_ADMIN_ROLE ? 'grape' : 'neutral'}>
                            {roleDefinition(papel).name}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <StaffStatusBadge status={pessoa.status} />
                        {pessoa.mustChangePassword && pessoa.status === 'ACTIVE' ? (
                          <span className="text-xs text-ink-500">Ainda não criou a senha</span>
                        ) : null}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap text-ink-600">
                      {pessoa.lastLoginAt ? (
                        <time
                          dateTime={pessoa.lastLoginAt.toISOString()}
                          title={formatDateTimeBR(pessoa.lastLoginAt, auth.park.timezone)}
                        >
                          {formatRelativeTime(pessoa.lastLoginAt)}
                        </time>
                      ) : (
                        <span className="text-ink-400">Nunca entrou</span>
                      )}
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/usuarios/${pessoa.id}`}
                        className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        aria-label={`Abrir ${pessoa.name}`}
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
    </>
  );
}
