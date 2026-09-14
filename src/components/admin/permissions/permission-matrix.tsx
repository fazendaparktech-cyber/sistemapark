'use client';

import { Check, Lock, Minus, RotateCcw, Table2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  defaultPermissionsFor,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  type PermissionKey,
  type RoleKey,
} from '@/lib/access';
import { api, errorMessage } from '@/lib/api-client';

import { Alert } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { cn } from '../../ui/cn';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { Checkbox } from '../../ui/field';

export interface MatrixRole {
  key: RoleKey;
  name: string;
  description: string | null;
  editable: boolean;
  permissions: PermissionKey[];
  members: number;
}

export function PermissionMatrix({
  roles,
  canEdit,
  grantable,
}: {
  roles: MatrixRole[];
  canEdit: boolean;
  grantable: PermissionKey[];
}) {
  const router = useRouter();
  const primeiroEditavel = roles.find((papel) => papel.editable)?.key ?? roles[0]?.key;
  const [selecionado, setSelecionado] = useState<RoleKey | undefined>(primeiroEditavel);
  const [rascunhos, setRascunhos] = useState<Partial<Record<RoleKey, PermissionKey[]>>>({});
  const [comparando, setComparando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const podeConceder = useMemo(() => new Set(grantable), [grantable]);

  const papel = roles.find((item) => item.key === selecionado);
  if (!papel)
    return <Alert tone="warning">Nenhum papel cadastrado. Rode a sincronização de permissões.</Alert>;

  const papelAtual = papel;
  const atual = rascunhos[papelAtual.key] ?? papelAtual.permissions;
  const conjuntoAtual = new Set(atual);
  const adicionadas = atual.filter((chave) => !papelAtual.permissions.includes(chave));
  const retiradas = papelAtual.permissions.filter((chave) => !conjuntoAtual.has(chave));
  const alterado = adicionadas.length + retiradas.length > 0;
  const editavel = canEdit && papelAtual.editable;
  const padrao: readonly PermissionKey[] = defaultPermissionsFor(papelAtual.key);
  const igualAoPadrao =
    padrao.length === conjuntoAtual.size && padrao.every((chave) => conjuntoAtual.has(chave));

  function alternar(chave: PermissionKey, marcado: boolean) {
    const novo = marcado ? [...atual, chave] : atual.filter((item) => item !== chave);
    setRascunhos((anteriores) => ({ ...anteriores, [papelAtual.key]: novo }));
  }

  function descartar() {
    setRascunhos((anteriores) => {
      const copia = { ...anteriores };
      delete copia[papelAtual.key];
      return copia;
    });
  }

  /** Coloca as permissões de fábrica do perfil no rascunho; a pessoa confere e salva. */
  function restaurarPadrao() {
    setRascunhos((anteriores) => ({ ...anteriores, [papelAtual.key]: [...padrao] }));
  }

  async function salvar() {
    try {
      await api(`/api/admin/roles/${papelAtual.key}/permissions`, {
        method: 'PUT',
        body: { permissions: atual },
      });
      toast.success(`Permissões de ${papelAtual.name} atualizadas.`);
      descartar();
      router.refresh();
      return true;
    } catch (falha) {
      toast.error(errorMessage(falha));
      return false;
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!canEdit ? (
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Lock className="size-4" aria-hidden /> Somente leitura: você pode consultar, mas não alterar.
          </p>
        ) : (
          <p className="text-sm text-ink-500">
            Mudanças valem na próxima ação de cada pessoa e ficam na auditoria.
          </p>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setComparando((v) => !v)}
          aria-pressed={comparando}
        >
          <Table2 className="size-4" aria-hidden /> {comparando ? 'Editar por papel' : 'Comparar papéis'}
        </Button>
      </div>

      {comparando ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-ink-200/70">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead className="sticky top-0 bg-ink-50 text-ink-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Permissão
                </th>
                {roles.map((item) => (
                  <th key={item.key} scope="col" className="px-2 py-3 text-center font-semibold">
                    {item.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((grupo) => (
                <FragmentoDoGrupo key={grupo.key} label={grupo.label} colunas={roles.length + 1}>
                  {grupo.permissions.map((permissao) => (
                    <tr key={permissao.key} className="border-t border-ink-100">
                      <th scope="row" className="px-4 py-2 font-normal text-ink-700">
                        {permissao.label}
                      </th>
                      {roles.map((item) => {
                        const tem = (rascunhos[item.key] ?? item.permissions).includes(permissao.key);
                        return (
                          <td key={item.key} className="px-2 py-2 text-center">
                            {tem ? (
                              <Check className="mx-auto size-4 text-pool-700" aria-label="Sim" />
                            ) : (
                              <Minus className="mx-auto size-4 text-ink-300" aria-label="Não" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </FragmentoDoGrupo>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav
            aria-label="Papéis"
            className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0"
          >
            {roles.map((item) => {
              const ativo = item.key === papelAtual.key;
              const pendente = rascunhos[item.key] !== undefined;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelecionado(item.key)}
                  aria-current={ativo ? 'true' : undefined}
                  className={cn(
                    'min-w-44 shrink-0 rounded-xl px-3.5 py-3 text-left ring-1 ring-inset transition-colors lg:min-w-0',
                    ativo
                      ? 'bg-white shadow-card ring-pool-300'
                      : 'bg-transparent ring-transparent hover:bg-white/70 hover:ring-ink-200',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('text-sm font-semibold', ativo ? 'text-pool-800' : 'text-ink-800')}>
                      {item.name}
                    </span>
                    {pendente ? (
                      <span className="size-2 rounded-full bg-sun-500" aria-label="Alterações não salvas" />
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                    <Users className="size-3.5" aria-hidden />
                    {item.members === 1 ? '1 pessoa' : `${item.members} pessoas`} · {item.permissions.length}{' '}
                    permissões
                  </span>
                </button>
              );
            })}
          </nav>

          <Card className="overflow-hidden">
            <div className="border-b border-ink-100 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink-900">
                  {papelAtual.name}
                </h2>
                {!papelAtual.editable ? <Badge tone="grape">Acesso total fixo</Badge> : null}
                {editavel && !igualAoPadrao ? (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={restaurarPadrao}>
                    <RotateCcw className="size-4" aria-hidden /> Restaurar padrão
                  </Button>
                ) : null}
              </div>
              {papelAtual.description ? (
                <p className="mt-1 text-sm text-ink-500">{papelAtual.description}</p>
              ) : null}
            </div>

            <div className="grid gap-6 px-5 py-5 sm:px-6">
              {PERMISSION_GROUPS.map((grupo) => (
                <fieldset key={grupo.key}>
                  <legend className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                    {grupo.label}
                  </legend>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {grupo.permissions.map((permissao) => {
                      const id = `perm-${papelAtual.key}-${permissao.key}`;
                      const marcado = conjuntoAtual.has(permissao.key);
                      const semDireito = !podeConceder.has(permissao.key);
                      const desabilitado = !editavel || (semDireito && !marcado);
                      return (
                        <label
                          key={permissao.key}
                          htmlFor={id}
                          className={cn(
                            'flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors',
                            desabilitado ? 'cursor-default' : 'cursor-pointer hover:bg-ink-50',
                          )}
                        >
                          <Checkbox
                            id={id}
                            checked={marcado}
                            disabled={desabilitado}
                            onChange={(evento) => alternar(permissao.key, evento.target.checked)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-ink-800">{permissao.label}</span>
                            <span className="block font-mono text-[11px] text-ink-400">{permissao.key}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            {editavel && alterado ? (
              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
                <p className="text-sm text-ink-600">
                  {adicionadas.length > 0 ? `+${adicionadas.length} ` : ''}
                  {retiradas.length > 0 ? `−${retiradas.length} ` : ''}
                  alteraç{adicionadas.length + retiradas.length === 1 ? 'ão' : 'ões'} não salva
                  {adicionadas.length + retiradas.length === 1 ? '' : 's'}
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={descartar}>
                    Descartar
                  </Button>
                  <Button onClick={() => setConfirmando(true)}>Salvar</Button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title={`Salvar as permissões de ${papelAtual.name}?`}
        description={`Vale para ${papelAtual.members === 1 ? 'a pessoa' : `as ${papelAtual.members} pessoas`} com este papel.`}
        confirmLabel="Salvar permissões"
        onConfirm={salvar}
      >
        <div className="grid gap-3 text-sm">
          {adicionadas.length > 0 ? (
            <div>
              <p className="font-semibold text-success-800">Passa a poder</p>
              <ul className="mt-1 list-disc pl-5 text-ink-700">
                {adicionadas.map((chave) => (
                  <li key={chave}>{PERMISSION_LABELS[chave]}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {retiradas.length > 0 ? (
            <div>
              <p className="font-semibold text-danger-700">Deixa de poder</p>
              <ul className="mt-1 list-disc pl-5 text-ink-700">
                {retiradas.map((chave) => (
                  <li key={chave}>{PERMISSION_LABELS[chave]}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function FragmentoDoGrupo({
  label,
  colunas,
  children,
}: {
  label: string;
  colunas: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="border-t border-ink-200 bg-ink-50/60">
        <th
          scope="colgroup"
          colSpan={colunas}
          className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500"
        >
          {label}
        </th>
      </tr>
      {children}
    </>
  );
}
