'use client';

import { Power, PowerOff, Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { api, errorMessage } from '@/lib/api-client';

import { Button } from '../../ui/button';
import { ConfirmDialog } from '../../ui/confirm-dialog';

/** Ativar, desativar e excluir (só cupom nunca usado). */
export function CouponActions({
  couponId,
  code,
  isActive,
  canDelete,
}: {
  couponId: string;
  code: string;
  isActive: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [alternando, setAlternando] = useState(false);
  const [excluir, setExcluir] = useState(false);

  async function alternar() {
    setAlternando(true);
    try {
      await api(`/api/admin/coupons/${couponId}/status`, { method: 'POST', body: { isActive: !isActive } });
      toast.success(isActive ? `Cupom ${code} desativado.` : `Cupom ${code} ativado.`);
      router.refresh();
    } catch (falha) {
      toast.error(errorMessage(falha));
    } finally {
      setAlternando(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={alternar} loading={alternando}>
        {alternando ? null : isActive ? (
          <PowerOff className="size-4" aria-hidden />
        ) : (
          <Power className="size-4" aria-hidden />
        )}
        {isActive ? 'Desativar' : 'Ativar'}
      </Button>
      {canDelete ? (
        <>
          <Button variant="danger-soft" onClick={() => setExcluir(true)}>
            <Trash className="size-4" aria-hidden />
            Excluir
          </Button>
          <ConfirmDialog
            open={excluir}
            onOpenChange={setExcluir}
            title={`Excluir o cupom ${code}?`}
            description="O cupom nunca foi usado, então pode ser excluído. Esta ação não pode ser desfeita."
            confirmLabel="Excluir cupom"
            variant="danger"
            onConfirm={async () => {
              try {
                await api(`/api/admin/coupons/${couponId}`, { method: 'DELETE' });
                toast.success(`Cupom ${code} excluído.`);
                router.push('/admin/cupons');
                router.refresh();
                return true;
              } catch (falha) {
                toast.error(errorMessage(falha));
                return false;
              }
            }}
          />
        </>
      ) : null}
    </>
  );
}
