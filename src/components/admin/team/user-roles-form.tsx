'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import type { RoleKey } from '@/lib/access';
import { api, errorMessage } from '@/lib/api-client';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '../../ui/card';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { RoleCheckboxes, type RoleOption } from './role-checkboxes';

export function UserRolesForm({
  userId,
  personName,
  currentRoles,
  options,
  canEdit,
  lockedReason,
}: {
  userId: string;
  personName: string;
  currentRoles: RoleKey[];
  options: RoleOption[];
  canEdit: boolean;
  lockedReason?: string;
}) {
  const router = useRouter();
  const [papeis, setPapeis] = useState<RoleKey[]>(currentRoles);
  const [confirmando, setConfirmando] = useState(false);

  const alterado = [...papeis].sort().join() !== [...currentRoles].sort().join();
  // Papéis que a pessoa já tem e que quem edita não pode atribuir continuam visíveis, só leitura.
  const opcoes = [
    ...options,
    ...currentRoles
      .filter((papel) => !options.some((opcao) => opcao.key === papel))
      .map((papel) => ({ key: papel, name: papel, description: null })),
  ];

  async function salvar() {
    try {
      await api(`/api/admin/users/${userId}/roles`, { method: 'PUT', body: { roles: papeis } });
      toast.success('Papéis atualizados. As sessões abertas dessa pessoa foram encerradas.');
      router.refresh();
      return true;
    } catch (falha) {
      toast.error(errorMessage(falha));
      return false;
    }
  }

  return (
    <Card>
      <CardHeader title="Papéis" description="Definem o que a pessoa pode ver e fazer no sistema." />
      <CardContent className="grid gap-4">
        {lockedReason ? <Alert tone="info">{lockedReason}</Alert> : null}
        <RoleCheckboxes
          options={opcoes}
          value={papeis}
          onChange={setPapeis}
          disabled={!canEdit}
          idPrefix="papel"
        />
      </CardContent>
      {canEdit ? (
        <CardFooter>
          {alterado ? (
            <Button variant="ghost" onClick={() => setPapeis(currentRoles)}>
              Desfazer
            </Button>
          ) : null}
          <Button onClick={() => setConfirmando(true)} disabled={!alterado || papeis.length === 0}>
            Salvar papéis
          </Button>
        </CardFooter>
      ) : null}

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title={`Alterar os papéis de ${personName}?`}
        description="A mudança vale na hora. Por segurança, as sessões abertas dessa pessoa são encerradas e ela precisa entrar de novo."
        confirmLabel="Alterar papéis"
        onConfirm={salvar}
      />
    </Card>
  );
}
