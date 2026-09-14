'use client';

import { Bell, CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Popover } from 'radix-ui';
import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api-client';
import { formatDateTimeBR } from '@/lib/dates';

import { cn } from '../ui/cn';

type Gravidade = 'INFO' | 'WARNING' | 'CRITICAL';

interface Aviso {
  id: string;
  type: string;
  severity: Gravidade;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  read: boolean;
}

interface ListaDeAvisos {
  items: Aviso[];
  unread: number;
}

const ATUALIZAR_A_CADA = 60_000;

const ICONES: Record<Gravidade, LucideIcon> = {
  CRITICAL: CircleAlert,
  WARNING: TriangleAlert,
  INFO: Info,
};

const CORES: Record<Gravidade, string> = {
  CRITICAL: 'text-danger-600',
  WARNING: 'text-warning-600',
  INFO: 'text-pool-600',
};

/**
 * Sino do painel: lotação perto do limite, pagamento com problema, ingresso não
 * emitido, e-mail não enviado e ingresso usado duas vezes. Cada pessoa vê só os
 * avisos das áreas que pode acessar.
 */
export function NotificationBell({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<ListaDeAvisos | null>(null);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback((signal?: AbortSignal) => {
    api<ListaDeAvisos>('/api/admin/notifications', { signal })
      .then((resposta) => {
        setLista(resposta);
        setFalhou(false);
      })
      .catch((erro: unknown) => {
        if (erro instanceof DOMException && erro.name === 'AbortError') return;
        setFalhou(true);
      });
  }, []);

  useEffect(() => {
    const controle = new AbortController();
    carregar(controle.signal);
    const intervalo = setInterval(() => carregar(), ATUALIZAR_A_CADA);
    return () => {
      controle.abort();
      clearInterval(intervalo);
    };
  }, [carregar]);

  function marcarComoLidos(corpo: { ids: string[] } | { all: true }) {
    setLista((atual) => {
      if (!atual) return atual;
      const alvo = (aviso: Aviso) => 'all' in corpo || corpo.ids.includes(aviso.id);
      const lidosAgora = atual.items.filter((aviso) => !aviso.read && alvo(aviso)).length;
      return {
        items: atual.items.map((aviso) => (alvo(aviso) ? { ...aviso, read: true } : aviso)),
        unread: 'all' in corpo ? 0 : Math.max(0, atual.unread - lidosAgora),
      };
    });
    api<{ unread: number }>('/api/admin/notifications/read', { method: 'POST', body: corpo })
      .then((resposta) => setLista((atual) => (atual ? { ...atual, unread: resposta.unread } : atual)))
      .catch(() => carregar());
  }

  function abrirAviso(aviso: Aviso) {
    if (!aviso.read) marcarComoLidos({ ids: [aviso.id] });
    if (aviso.href) {
      setAberto(false);
      router.push(aviso.href);
    }
  }

  const naoLidos = lista?.unread ?? 0;

  return (
    <Popover.Root
      open={aberto}
      onOpenChange={(valor) => {
        setAberto(valor);
        if (valor) carregar();
      }}
    >
      <Popover.Trigger
        className="relative grid size-10 place-items-center rounded-xl text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 data-[state=open]:bg-ink-100"
        aria-label={naoLidos > 0 ? `Avisos: ${naoLidos} não lidos` : 'Avisos'}
      >
        <Bell className="size-5" aria-hidden />
        {naoLidos > 0 ? (
          <span
            aria-hidden
            className="tabular absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-canvas"
          >
            {naoLidos > 99 ? '99+' : naoLidos}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(92vw,24rem)] overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-ink-200 focus:outline-none data-[state=open]:animate-rise-in"
        >
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
            <p className="font-display text-[15px] font-semibold text-ink-900">Avisos</p>
            {naoLidos > 0 ? (
              <button
                type="button"
                onClick={() => marcarComoLidos({ all: true })}
                className="text-[13px] font-semibold text-pool-700 hover:text-pool-800"
              >
                Marcar todos como lidos
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
            {!lista ? (
              <p className="px-4 py-8 text-center text-sm text-ink-500">
                {falhou ? 'Não foi possível carregar os avisos.' : 'Carregando avisos…'}
              </p>
            ) : lista.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-500">Nenhum aviso nos últimos 30 dias.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {lista.items.map((aviso) => {
                  const Icone = ICONES[aviso.severity];
                  return (
                    <li key={aviso.id}>
                      <button
                        type="button"
                        onClick={() => abrirAviso(aviso)}
                        className={cn(
                          'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50',
                          !aviso.read && 'bg-pool-50/60',
                        )}
                      >
                        <Icone
                          className={cn('mt-0.5 size-[18px] shrink-0', CORES[aviso.severity])}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={cn('text-sm text-ink-900', !aviso.read && 'font-semibold')}>
                              {aviso.title}
                            </span>
                            {!aviso.read ? (
                              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-pool-600" />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-5 text-ink-600">
                            {aviso.body}
                          </span>
                          <span className="mt-1 block text-xs text-ink-400">
                            {formatDateTimeBR(new Date(aviso.createdAt), timeZone)}
                            {aviso.read ? null : <span className="sr-only"> (não lido)</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
