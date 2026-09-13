'use client';

import { useState, type ReactNode } from 'react';

import { Button, type ButtonVariant } from './button';
import { Dialog, DialogContent } from './dialog';

/**
 * Confirmação para ações que mudam algo importante. O botão fica ocupado
 * enquanto a ação roda, e a janela só fecha se ela der certo.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  variant = 'primary',
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  onConfirm: () => Promise<boolean | void> | boolean | void;
  children?: ReactNode;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    setOcupado(true);
    try {
      const resultado = await onConfirm();
      if (resultado !== false) onOpenChange(false);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(aberto) => !ocupado && onOpenChange(aberto)}>
      <DialogContent title={title} description={description} size="sm">
        {children}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={ocupado}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={confirmar} loading={ocupado}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
