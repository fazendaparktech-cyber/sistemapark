import { ClipboardList } from 'lucide-react';
import Link from 'next/link';

import { AuditDetails } from '@/components/admin/audit/audit-details';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { AUDIT_ACTION_GROUPS, auditActionLabel, auditActorFallback } from '@/lib/audit-labels';
import { addDays, dayBounds, formatDateTimeBR, isDateOnly } from '@/lib/dates';
import { describeUserAgent } from '@/lib/user-agent';
import { listAuditLogs } from '@/server/audit';
import type { AuthContext } from '@/server/auth/context';
import type { SearchParamsRecord } from '@/server/filters';

const BASE = '/admin/atividades';

function texto(valor: string | string[] | undefined, maximo = 120): string | undefined {
  return typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, maximo) : undefined;
}

/** Registro de tudo o que foi feito no sistema (auditoria). */
export async function ActivityLog({
  auth,
  parametros,
}: {
  auth: AuthContext;
  parametros: SearchParamsRecord;
}) {
  const grupoBruto = texto(parametros.grupo);
  const grupo = AUDIT_ACTION_GROUPS.find((item) => item.value === grupoBruto)?.value;
  const de = texto(parametros.de);
  const ate = texto(parametros.ate);
  const registro = texto(parametros.registro, 100);
  const cursor = texto(parametros.cursor, 300);
  const tz = auth.park.timezone;

  const dataInicial = de && isDateOnly(de) ? de : undefined;
  const dataFinal = ate && isDateOnly(ate) ? ate : undefined;

  const { items, nextCursor } = await listAuditLogs(auth, {
    action: grupo,
    entityId: registro,
    from: dataInicial ? dayBounds(dataInicial, tz).start : undefined,
    to: dataFinal ? dayBounds(addDays(dataFinal, 1), tz).start : undefined,
    cursor,
    limit: 50,
  });

  const filtros = new URLSearchParams();
  if (grupo) filtros.set('grupo', grupo);
  if (dataInicial) filtros.set('de', dataInicial);
  if (dataFinal) filtros.set('ate', dataFinal);
  if (registro) filtros.set('registro', registro);
  const filtrando = filtros.size > 0;
  const comFiltros = (extra: Record<string, string>) => {
    const busca = new URLSearchParams(filtros);
    for (const [chave, valor] of Object.entries(extra)) busca.set(chave, valor);
    const consulta = busca.toString();
    return consulta ? `${BASE}?${consulta}` : BASE;
  };

  return (
    <>
      <Card className="p-4 sm:p-5">
        <form className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_170px_170px_auto] sm:items-end">
          <Field id="filtro-grupo" label="Tipo de ação">
            <Select id="filtro-grupo" name="grupo" defaultValue={grupo ?? ''}>
              <option value="">Todas as ações</option>
              {AUDIT_ACTION_GROUPS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="filtro-de" label="De">
            <Input id="filtro-de" name="de" type="date" defaultValue={dataInicial} />
          </Field>
          <Field id="filtro-ate" label="Até">
            <Input id="filtro-ate" name="ate" type="date" defaultValue={dataFinal} />
          </Field>
          {registro ? <input type="hidden" name="registro" value={registro} /> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
            {filtrando ? (
              <Link href={BASE} className={buttonClasses('ghost')}>
                Limpar
              </Link>
            ) : null}
          </div>
        </form>
        {registro ? (
          <p className="mt-3 text-[13px] text-ink-500">
            Mostrando só o registro <span className="font-mono text-ink-700">{registro}</span>.
          </p>
        ) : null}
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Nenhum registro encontrado"
            description={
              filtrando
                ? 'Mude os filtros para ver outros períodos ou ações.'
                : 'As ações feitas no sistema aparecem aqui.'
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ol className="divide-y divide-ink-100">
            {items.map((item) => (
              <li key={item.id}>
                <details className="group">
                  <summary className="grid cursor-pointer list-none gap-1 px-5 py-4 transition-colors hover:bg-ink-50/70 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,220px)] sm:gap-5 sm:px-6">
                    <time
                      dateTime={item.createdAt.toISOString()}
                      className="tabular text-[13px] text-ink-500"
                    >
                      {formatDateTimeBR(item.createdAt, tz)}
                    </time>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-900">
                        {auditActionLabel(item.action)}
                      </span>
                    </span>
                    <span className="min-w-0 text-[13px] sm:text-right">
                      {item.actor ? (
                        <Badge tone="neutral">Painel</Badge>
                      ) : (
                        <Badge tone="neutral">{auditActorFallback(item.action, item.actorType)}</Badge>
                      )}
                      {item.ip ? <span className="block truncate text-ink-500">IP {item.ip}</span> : null}
                    </span>
                  </summary>
                  <div className="grid gap-4 bg-ink-50/60 px-5 py-4 sm:px-6">
                    <AuditDetails before={item.before} after={item.after} data={item.data} />
                    <dl className="grid gap-x-6 gap-y-1 text-[12px] text-ink-500 sm:grid-cols-3">
                      <div>
                        <dt className="inline">Registro: </dt>
                        <dd className="inline font-mono">
                          {item.entityType ?? '—'} {item.entityId ?? ''}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Aparelho: </dt>
                        <dd className="inline">{describeUserAgent(item.userAgent)}</dd>
                      </div>
                      <div>
                        <dt className="inline">Requisição: </dt>
                        <dd className="inline font-mono">{item.requestId ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {cursor || nextCursor ? (
        <nav aria-label="Paginação" className="flex flex-wrap justify-between gap-2">
          {cursor ? (
            <Link href={comFiltros({})} className={buttonClasses('secondary', 'sm')}>
              Mais recentes
            </Link>
          ) : (
            <span />
          )}
          {nextCursor ? (
            <Link href={comFiltros({ cursor: nextCursor })} className={buttonClasses('secondary', 'sm')}>
              Registros mais antigos
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
