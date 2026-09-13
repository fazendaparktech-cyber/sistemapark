import type { Prisma } from '@/generated/prisma/client';
import { roleDefinition, isRoleKey, PERMISSION_LABELS, isPermissionKey } from '@/lib/access';
import { AUDIT_REASON_LABELS } from '@/lib/audit-labels';
import { formatPhoneBR } from '@/lib/documents';

import { cn } from '../../ui/cn';

/**
 * Antes e depois de um registro de auditoria, campo a campo, com as mudanças
 * destacadas. Valores conhecidos (papéis, permissões, motivos) aparecem em
 * português.
 */

const NOMES_DE_CAMPO: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  phone: 'Celular',
  status: 'Situação',
  roles: 'Papéis',
  permissions: 'Permissões',
  added: 'Incluídas',
  removed: 'Retiradas',
  reason: 'Motivo',
  revoked: 'Sessões encerradas',
  via: 'Origem',
  osUser: 'Usuário do servidor',
};

const SITUACOES: Record<string, string> = { ACTIVE: 'Ativo', SUSPENDED: 'Suspenso', DISABLED: 'Desativado' };

function traduzir(campo: string, valor: Prisma.JsonValue | undefined): string {
  if (valor === undefined || valor === null || valor === '') return '—';
  if (Array.isArray(valor)) {
    if (valor.length === 0) return 'nenhum';
    return valor
      .map((item) => {
        const textoItem = String(item);
        if (isRoleKey(textoItem)) return roleDefinition(textoItem).name;
        if (isPermissionKey(textoItem)) return PERMISSION_LABELS[textoItem];
        return textoItem;
      })
      .join(', ');
  }
  if (typeof valor === 'object') return JSON.stringify(valor);
  const texto = String(valor);
  if (campo === 'status') return SITUACOES[texto] ?? texto;
  if (campo === 'reason') return AUDIT_REASON_LABELS[texto] ?? texto;
  if (campo === 'phone' && /^55\d{10,11}$/.test(texto)) return formatPhoneBR(texto);
  return texto;
}

function comoObjeto(valor: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, Prisma.JsonValue>)
    : {};
}

export function AuditDetails({
  before,
  after,
  data,
}: {
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  data: Prisma.JsonValue | null;
}) {
  const antes = comoObjeto(before);
  const depois = comoObjeto(after);
  const extras = comoObjeto(data);
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])];
  const temComparacao = campos.length > 0;
  const camposExtras = Object.keys(extras);

  if (!temComparacao && camposExtras.length === 0) {
    return <p className="text-[13px] text-ink-500">Sem detalhes adicionais.</p>;
  }

  return (
    <div className="grid gap-4">
      {temComparacao ? (
        <div className="overflow-x-auto rounded-xl ring-1 ring-ink-200">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Campo
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Antes
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Depois
                </th>
              </tr>
            </thead>
            <tbody>
              {campos.map((campo) => {
                const valorAntes = traduzir(campo, antes[campo]);
                const valorDepois = traduzir(campo, depois[campo]);
                const mudou = valorAntes !== valorDepois;
                return (
                  <tr key={campo} className="border-t border-ink-100">
                    <th scope="row" className="px-3 py-2 font-medium text-ink-700">
                      {NOMES_DE_CAMPO[campo] ?? campo}
                    </th>
                    <td
                      className={cn(
                        'px-3 py-2',
                        mudou ? 'text-danger-700 line-through decoration-danger-600/40' : 'text-ink-600',
                      )}
                    >
                      {valorAntes}
                    </td>
                    <td
                      className={cn('px-3 py-2', mudou ? 'font-semibold text-success-800' : 'text-ink-600')}
                    >
                      {valorDepois}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {camposExtras.length > 0 ? (
        <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          {camposExtras.map((campo) => (
            <div key={campo} className="min-w-0">
              <dt className="text-ink-500">{NOMES_DE_CAMPO[campo] ?? campo}</dt>
              <dd className="break-words font-medium text-ink-800">{traduzir(campo, extras[campo])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
