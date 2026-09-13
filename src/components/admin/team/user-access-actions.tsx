'use client';

import { Ban, KeyRound, LogOut, PauseCircle, PlayCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import type { UserStatus } from '@/generated/prisma/enums';
import { api, errorMessage } from '@/lib/api-client';

import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { Dialog, DialogContent } from '../../ui/dialog';
import { TemporaryPassword } from './temporary-password';

type Acao = 'suspender' | 'desativar' | 'reativar' | 'senha' | 'sessoes';

const CONFIRMACOES: Record<Acao, { titulo: string; descricao: string; botao: string; perigo: boolean }> = {
  suspender: {
    titulo: 'Suspender o acesso?',
    descricao:
      'A pessoa sai do sistema na hora e não consegue entrar até alguém reativar. Use para afastamentos.',
    botao: 'Suspender',
    perigo: true,
  },
  desativar: {
    titulo: 'Desativar o acesso?',
    descricao:
      'Para quem saiu da equipe. A pessoa sai do sistema na hora. O histórico dela continua guardado na auditoria.',
    botao: 'Desativar',
    perigo: true,
  },
  reativar: {
    titulo: 'Reativar o acesso?',
    descricao: 'A pessoa volta a entrar com a senha que já tinha, com os mesmos papéis.',
    botao: 'Reativar',
    perigo: false,
  },
  senha: {
    titulo: 'Gerar nova senha temporária?',
    descricao:
      'A senha atual deixa de funcionar, as sessões abertas são encerradas e a pessoa cria uma senha nova no próximo acesso.',
    botao: 'Gerar senha',
    perigo: false,
  },
  sessoes: {
    titulo: 'Encerrar as sessões abertas?',
    descricao: 'A pessoa sai de todos os aparelhos e precisa entrar de novo. A senha continua a mesma.',
    botao: 'Encerrar sessões',
    perigo: true,
  },
};

export function UserAccessActions({
  userId,
  personName,
  status,
  activeSessions,
}: {
  userId: string;
  personName: string;
  status: UserStatus;
  activeSessions: number;
}) {
  const router = useRouter();
  const [acao, setAcao] = useState<Acao | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);

  async function executar(): Promise<boolean> {
    if (!acao) return false;
    try {
      if (acao === 'senha') {
        const { temporaryPassword } = await api<{ temporaryPassword: string }>(
          `/api/admin/users/${userId}/password-reset`,
          { method: 'POST' },
        );
        setSenhaGerada(temporaryPassword);
      } else if (acao === 'sessoes') {
        const { revoked } = await api<{ revoked: number }>(`/api/admin/users/${userId}/sessions`, {
          method: 'DELETE',
        });
        toast.success(revoked === 1 ? '1 sessão encerrada.' : `${revoked} sessões encerradas.`);
      } else {
        const novoStatus: UserStatus =
          acao === 'suspender' ? 'SUSPENDED' : acao === 'desativar' ? 'DISABLED' : 'ACTIVE';
        await api(`/api/admin/users/${userId}/status`, { method: 'PUT', body: { status: novoStatus } });
        toast.success(
          novoStatus === 'ACTIVE' ? 'Acesso reativado.' : 'Acesso bloqueado e sessões encerradas.',
        );
      }
      router.refresh();
      return true;
    } catch (falha) {
      toast.error(errorMessage(falha));
      return false;
    }
  }

  const confirmacao = acao ? CONFIRMACOES[acao] : null;

  return (
    <Card>
      <CardHeader title="Acesso" description="Bloquear, liberar e recuperar o acesso desta pessoa." />
      <CardContent className="grid gap-2">
        {status === 'ACTIVE' ? (
          <>
            <Button variant="secondary" className="justify-start" onClick={() => setAcao('senha')}>
              <KeyRound className="size-4" aria-hidden /> Gerar nova senha temporária
            </Button>
            <Button
              variant="secondary"
              className="justify-start"
              onClick={() => setAcao('sessoes')}
              disabled={activeSessions === 0}
            >
              <LogOut className="size-4" aria-hidden />
              {activeSessions === 0 ? 'Nenhuma sessão aberta' : 'Encerrar sessões abertas'}
            </Button>
            <Button variant="danger-soft" className="justify-start" onClick={() => setAcao('suspender')}>
              <PauseCircle className="size-4" aria-hidden /> Suspender acesso
            </Button>
            <Button variant="danger-soft" className="justify-start" onClick={() => setAcao('desativar')}>
              <Ban className="size-4" aria-hidden /> Desativar acesso
            </Button>
          </>
        ) : (
          <Button className="justify-start" onClick={() => setAcao('reativar')}>
            <PlayCircle className="size-4" aria-hidden /> Reativar acesso
          </Button>
        )}
      </CardContent>

      {confirmacao ? (
        <ConfirmDialog
          open={acao !== null}
          onOpenChange={(aberto) => !aberto && setAcao(null)}
          title={confirmacao.titulo}
          description={`${personName}: ${confirmacao.descricao}`}
          confirmLabel={confirmacao.botao}
          variant={confirmacao.perigo ? 'danger' : 'primary'}
          onConfirm={executar}
        />
      ) : null}

      <Dialog open={senhaGerada !== null} onOpenChange={(aberto) => !aberto && setSenhaGerada(null)}>
        <DialogContent
          title="Nova senha temporária"
          description={`A senha anterior de ${personName} já não funciona.`}
          size="sm"
        >
          {senhaGerada ? <TemporaryPassword password={senhaGerada} personName={personName} /> : null}
          <Button className="mt-5 w-full" onClick={() => setSenhaGerada(null)}>
            Concluir
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
