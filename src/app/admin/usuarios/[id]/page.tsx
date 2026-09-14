import { ArrowLeft, Monitor } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AuditDetails } from '@/components/admin/audit/audit-details';
import { NoPermission } from '@/components/admin/no-permission';
import { StaffStatusBadge } from '@/components/admin/team/staff-status';
import { UserAccessActions } from '@/components/admin/team/user-access-actions';
import { UserProfileForm } from '@/components/admin/team/user-profile-form';
import { UserRolesForm } from '@/components/admin/team/user-roles-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SUPER_ADMIN_ROLE } from '@/lib/access';
import { auditActionLabel, auditActorFallback } from '@/lib/audit-labels';
import { formatDateBR, dateOnlyOf, formatDateTimeBR } from '@/lib/dates';
import { formatRelativeTime } from '@/lib/relative-time';
import { describeUserAgent } from '@/lib/user-agent';
import { uuidSchema } from '@/lib/validation';
import { listRoles, loadAccess } from '@/server/access/service';
import { listAuditLogs } from '@/server/audit';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { isAppError } from '@/server/errors';
import { getUser } from '@/server/users/service';

export const metadata: Metadata = { title: 'Pessoa da equipe' };

export default async function PessoaDaEquipePage({ params }: PageProps<'/admin/usuarios/[id]'>) {
  const auth = await requirePageAuth();
  if (!can(auth, 'users.view')) return <NoPermission />;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const pessoa = await getUser(auth, id).catch((erro: unknown) => {
    if (isAppError(erro) && erro.code === 'NOT_FOUND') notFound();
    throw erro;
  });

  const [papeis, acessoDaPessoa, historico] = await Promise.all([
    listRoles(auth),
    loadAccess(pessoa.id, auth.park.id),
    can(auth, 'audit.view') ? listAuditLogs(auth, { entityId: pessoa.id, limit: 8 }) : null,
  ]);

  const ehVoce = pessoa.id === auth.user.id;
  const ehSuperAdmin = pessoa.roles.includes(SUPER_ADMIN_ROLE);
  const temMaisAcessoQueVoce = [...acessoDaPessoa.permissions].some(
    (permissao) => !auth.permissions.has(permissao),
  );
  const podeGerenciar =
    can(auth, 'users.manage') && !ehVoce && (auth.isSuperAdmin || (!ehSuperAdmin && !temMaisAcessoQueVoce));
  const podeEditarDados = can(auth, 'users.manage') && (ehVoce || podeGerenciar);

  const motivoBloqueio = ehVoce
    ? 'Você não pode alterar o próprio acesso. Peça a outra pessoa da administração.'
    : !can(auth, 'users.manage')
      ? 'Você pode ver, mas não alterar o acesso da equipe.'
      : ehSuperAdmin && !auth.isSuperAdmin
        ? 'Só um super admin pode alterar o acesso de outro super admin.'
        : temMaisAcessoQueVoce && !auth.isSuperAdmin
          ? 'Esta pessoa tem acessos que você não tem, por isso só um administrador acima pode alterá-la.'
          : undefined;

  const opcoesDePapel = papeis
    .filter((papel) => papel.key !== SUPER_ADMIN_ROLE || auth.isSuperAdmin)
    .filter(
      (papel) => auth.isSuperAdmin || papel.permissions.every((permissao) => auth.permissions.has(permissao)),
    )
    .map((papel) => ({ key: papel.key, name: papel.name, description: papel.description }));

  const agora = new Date();
  const tz = auth.park.timezone;

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/admin/usuarios"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-pool-700 hover:text-pool-800"
        >
          <ArrowLeft className="size-4" aria-hidden /> Usuários
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-900 sm:text-[30px]">
            {pessoa.name}
          </h1>
          <StaffStatusBadge status={pessoa.status} />
          {ehVoce ? <Badge tone="info">Você</Badge> : null}
        </div>
        <p className="mt-1 text-[15px] text-ink-500">
          {pessoa.email}
          {pessoa.createdBy ? ` · cadastrada por ${pessoa.createdBy.name}` : ''} · desde{' '}
          {formatDateBR(dateOnlyOf(pessoa.createdAt, tz))}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <UserProfileForm
            userId={pessoa.id}
            initial={{ name: pessoa.name, email: pessoa.email, phone: pessoa.phone }}
            canEdit={podeEditarDados}
          />
          <UserRolesForm
            userId={pessoa.id}
            personName={pessoa.name}
            currentRoles={pessoa.roles}
            options={opcoesDePapel}
            canEdit={podeGerenciar}
            lockedReason={motivoBloqueio}
          />

          {historico ? (
            <Card>
              <CardHeader
                title="Histórico"
                description="O que foi feito com este acesso."
                action={
                  <Link
                    href={`/admin/usuarios?aba=atividade&registro=${pessoa.id}`}
                    className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                  >
                    Ver tudo
                  </Link>
                }
              />
              <CardContent className="pt-3">
                {historico.items.length === 0 ? (
                  <p className="text-sm text-ink-500">Nada registrado ainda.</p>
                ) : (
                  <ol className="grid gap-1">
                    {historico.items.map((registro) => (
                      <li key={registro.id}>
                        <details className="group rounded-xl px-3 py-2.5 open:bg-ink-50">
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-ink-900">
                                {auditActionLabel(registro.action)}
                              </span>
                              <span className="block text-[13px] text-ink-500">
                                {registro.actor
                                  ? registro.actor.name
                                  : auditActorFallback(registro.action, registro.actorType)}
                              </span>
                            </span>
                            <time
                              dateTime={registro.createdAt.toISOString()}
                              title={formatDateTimeBR(registro.createdAt, tz)}
                              className="shrink-0 text-[13px] text-ink-500"
                            >
                              {formatRelativeTime(registro.createdAt, agora)}
                            </time>
                          </summary>
                          <div className="mt-3">
                            <AuditDetails
                              before={registro.before}
                              after={registro.after}
                              data={registro.data}
                            />
                          </div>
                        </details>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid gap-6">
          {podeGerenciar ? (
            <UserAccessActions
              userId={pessoa.id}
              personName={pessoa.name}
              status={pessoa.status}
              activeSessions={pessoa.sessions.length}
            />
          ) : null}

          <Card>
            <CardHeader
              title="Sessões abertas"
              description={
                pessoa.lastLoginAt
                  ? `Último login ${formatRelativeTime(pessoa.lastLoginAt, agora)}.`
                  : 'Esta pessoa ainda não entrou no sistema.'
              }
            />
            <CardContent className="pt-3">
              {pessoa.sessions.length === 0 ? (
                <p className="text-sm text-ink-500">Nenhuma sessão aberta agora.</p>
              ) : (
                <ul className="grid gap-3">
                  {pessoa.sessions.map((sessao) => (
                    <li key={sessao.id} className="flex gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-ink-200">
                        <Monitor className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-ink-900">
                          {describeUserAgent(sessao.userAgent)}
                          {sessao.current ? (
                            <Badge tone="citrus" className="ml-2 align-middle">
                              Esta sessão
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-[13px] text-ink-500">
                          Ativa {formatRelativeTime(sessao.lastSeenAt, agora)}
                          {sessao.ip ? ` · IP ${sessao.ip}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
