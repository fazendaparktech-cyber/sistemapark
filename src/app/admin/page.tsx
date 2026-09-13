import {
  Activity,
  Check,
  ChevronDown,
  CircleCheck,
  CircleDot,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { MetricCard } from '@/components/admin/metric-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHeader } from '@/components/ui/page-header';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, roleDefinition } from '@/lib/access';
import { formatDateTimeBR } from '@/lib/dates';
import { greetingFor } from '@/lib/greeting';
import { formatRelativeTime } from '@/lib/relative-time';
import { requirePageAuth } from '@/server/auth/guards';
import { getOverview } from '@/server/dashboard/overview';

export const metadata: Metadata = { title: 'Visão geral' };

const numero = new Intl.NumberFormat('pt-BR');

export default async function VisaoGeralPage() {
  const auth = await requirePageAuth();
  const visao = await getOverview(auth);
  const primeiroNome = auth.user.name.trim().split(/\s+/)[0] ?? auth.user.name;
  const agora = new Date();

  const acessoTotal = auth.isSuperAdmin || auth.permissions.size === ALL_PERMISSIONS.length;
  const gruposDoMeuAcesso = PERMISSION_GROUPS.map((grupo) => ({
    key: grupo.key,
    label: grupo.label,
    permissoes: grupo.permissions.filter((permissao) => auth.permissions.has(permissao.key)),
  })).filter((grupo) => grupo.permissoes.length > 0);

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={auth.park.name}
        title={`${greetingFor(auth.park.timezone, agora)}, ${primeiroNome}`}
        description="O que já está funcionando no sistema e o que ainda falta configurar."
      />

      {visao.team ? (
        <section aria-label="Resumo da equipe" className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Equipe ativa"
            value={numero.format(visao.team.active)}
            hint={
              visao.team.withoutAccess > 0
                ? `${numero.format(visao.team.withoutAccess)} com acesso suspenso ou desativado`
                : 'Ninguém com acesso suspenso'
            }
            icon={Users}
          />
          <MetricCard
            label="Conectados agora"
            value={numero.format(visao.team.onlineNow)}
            hint="Com atividade nos últimos 15 minutos"
            icon={CircleDot}
            tone="citrus"
          />
          {visao.activity24h !== null ? (
            <MetricCard
              label="Ações registradas"
              value={numero.format(visao.activity24h)}
              hint="Nas últimas 24 horas, na auditoria"
              icon={Activity}
              tone="grape"
            />
          ) : null}
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          {visao.setup ? (
            <Card>
              <CardHeader
                title="Prontidão do sistema"
                description="Itens de configuração que valem antes de vender."
              />
              <CardContent>
                <ul className="grid gap-3">
                  {visao.setup.map((item) => (
                    <li
                      key={item.key}
                      className={cn(
                        'flex gap-3 rounded-xl px-4 py-3 ring-1 ring-inset',
                        item.ok
                          ? 'bg-success-50/60 ring-success-600/15'
                          : 'bg-warning-50 ring-warning-600/20',
                      )}
                    >
                      {item.ok ? (
                        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-700" aria-hidden />
                      ) : (
                        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-700" aria-hidden />
                      )}
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-ink-900">
                          {item.title}
                          <span className="sr-only">{item.ok ? ': pronto' : ': pendente'}</span>
                        </p>
                        <p className="mt-0.5 break-words leading-6 text-ink-600">{item.detail}</p>
                        {item.href ? (
                          <Link
                            href={item.href}
                            className="mt-1 inline-block font-semibold text-pool-700 hover:text-pool-800"
                          >
                            Resolver
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {visao.recentLogins ? (
            <Card>
              <CardHeader
                title="Últimos acessos"
                action={
                  <Link
                    href="/admin/equipe"
                    className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                  >
                    Ver equipe
                  </Link>
                }
              />
              <CardContent className="pt-3">
                {visao.recentLogins.length === 0 ? (
                  <p className="text-sm text-ink-500">Ninguém entrou no sistema ainda.</p>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {visao.recentLogins.map((pessoa) => (
                      <li
                        key={pessoa.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/admin/equipe/${pessoa.id}`}
                            className="block truncate text-sm font-semibold text-ink-900 hover:text-pool-800"
                          >
                            {pessoa.name}
                          </Link>
                          <p className="truncate text-[13px] text-ink-500">
                            {pessoa.roles.map((papel) => roleDefinition(papel).name).join(', ')}
                          </p>
                        </div>
                        <time
                          dateTime={pessoa.lastLoginAt.toISOString()}
                          title={formatDateTimeBR(pessoa.lastLoginAt, auth.park.timezone)}
                          className="shrink-0 text-[13px] text-ink-500"
                        >
                          {formatRelativeTime(pessoa.lastLoginAt, agora)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader
            title="Seu acesso"
            description={auth.roles.map((papel) => roleDefinition(papel).description).join(' ')}
          />
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-1.5">
              {auth.roles.map((papel) => (
                <Badge key={papel} tone={papel === 'SUPER_ADMIN' ? 'grape' : 'info'}>
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {roleDefinition(papel).name}
                </Badge>
              ))}
            </div>

            {acessoTotal ? (
              <p className="rounded-xl bg-grape-50 px-4 py-3 text-sm leading-6 text-grape-800 ring-1 ring-inset ring-grape-100">
                Acesso total: todas as áreas e ações do sistema, inclusive equipe, permissões e configurações.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-600">
                  <span className="tabular font-semibold text-ink-900">{auth.permissions.size}</span> de{' '}
                  {ALL_PERMISSIONS.length} permissões, em {gruposDoMeuAcesso.length}{' '}
                  {gruposDoMeuAcesso.length === 1 ? 'área' : 'áreas'}.
                </p>
                <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl ring-1 ring-ink-200/70">
                  {gruposDoMeuAcesso.map((grupo) => (
                    <li key={grupo.key}>
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink-800 transition-colors hover:bg-ink-50">
                          {grupo.label}
                          <span className="flex items-center gap-2 text-[13px] font-medium text-ink-500">
                            <span className="tabular">{grupo.permissoes.length}</span>
                            <ChevronDown
                              className="size-4 transition-transform group-open:rotate-180"
                              aria-hidden
                            />
                          </span>
                        </summary>
                        <ul className="grid gap-1.5 px-4 pb-3 text-[13px] leading-5 text-ink-600">
                          {grupo.permissoes.map((permissao) => (
                            <li key={permissao.key} className="flex gap-2">
                              <Check className="mt-0.5 size-3.5 shrink-0 text-pool-700" aria-hidden />
                              {permissao.label}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
