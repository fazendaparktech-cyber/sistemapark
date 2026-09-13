'use client';

import { X } from 'lucide-react';
import { Dialog as Primitivo } from 'radix-ui';
import type { ReactNode } from 'react';

import { cn } from './cn';

export const Dialog = Primitivo.Root;
export const DialogTrigger = Primitivo.Trigger;
export const DialogClose = Primitivo.Close;

const LARGURAS = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' } as const;

/**
 * Janela sobreposta. No celular abre como painel na parte de baixo da tela
 * (fácil de alcançar com o polegar); no computador, centralizada.
 */
export function DialogContent({
  title,
  description,
  size = 'md',
  className,
  children,
  onInteractOutside,
}: {
  title: ReactNode;
  description?: ReactNode;
  size?: keyof typeof LARGURAS;
  className?: string;
  children: ReactNode;
  onInteractOutside?: (event: Event) => void;
}) {
  return (
    <Primitivo.Portal>
      <Primitivo.Overlay className="fixed inset-0 z-50 bg-ink-950/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <Primitivo.Content
        onInteractOutside={onInteractOutside}
        className={cn(
          'fixed inset-x-2 bottom-2 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-pop ring-1 ring-ink-200',
          'data-[state=open]:animate-rise-in focus:outline-none',
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-6',
          LARGURAS[size],
          className,
        )}
      >
        <div className="mb-5 pr-10">
          <Primitivo.Title className="font-display text-lg font-semibold tracking-[-0.01em] text-ink-900">
            {title}
          </Primitivo.Title>
          {description ? (
            <Primitivo.Description className="mt-1 text-sm leading-6 text-ink-500">
              {description}
            </Primitivo.Description>
          ) : (
            <Primitivo.Description className="sr-only">{title}</Primitivo.Description>
          )}
        </div>
        {children}
        <Primitivo.Close
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          aria-label="Fechar"
        >
          <X className="size-[18px]" aria-hidden />
        </Primitivo.Close>
      </Primitivo.Content>
    </Primitivo.Portal>
  );
}
