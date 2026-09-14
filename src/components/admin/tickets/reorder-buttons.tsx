'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { api, errorMessage } from '@/lib/api-client';

import { Button } from '../../ui/button';

/** Muda a ordem em que o ingresso aparece na página de compra. */
export function ReorderButtons({
  ticketTypeId,
  name,
  first,
  last,
}: {
  ticketTypeId: string;
  name: string;
  first: boolean;
  last: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<'up' | 'down' | null>(null);

  async function mover(direction: 'up' | 'down') {
    setOcupado(direction);
    try {
      await api(`/api/admin/ticket-types/${ticketTypeId}/move`, { method: 'POST', body: { direction } });
      router.refresh();
    } catch (falha) {
      toast.error(errorMessage(falha));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-lg"
        disabled={first || ocupado !== null}
        loading={ocupado === 'up'}
        onClick={() => mover('up')}
        aria-label={`Subir ${name} na página de compra`}
      >
        {ocupado === 'up' ? null : <ArrowUp className="size-4" aria-hidden />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-lg"
        disabled={last || ocupado !== null}
        loading={ocupado === 'down'}
        onClick={() => mover('down')}
        aria-label={`Descer ${name} na página de compra`}
      >
        {ocupado === 'down' ? null : <ArrowDown className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}
