'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button, type ButtonProps } from './button';

export function CopyButton({
  value,
  label = 'Copiar',
  ...props
}: { value: string; label?: string } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(value);
      setCopiado(true);
      toast.success('Copiado.');
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  return (
    <Button variant="secondary" onClick={copiar} {...props}>
      {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copiado ? 'Copiado' : label}
    </Button>
  );
}
