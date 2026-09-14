'use client';

import { useState, type ComponentProps } from 'react';

import { formatBRL, parseBRL } from '@/lib/money';

import { cn } from './cn';
import { Input } from './field';

function paraTexto(cents: number | null): string {
  // formatBRL devolve "R$" + espaço inseparável + valor; o campo mostra só o valor.
  return cents === null ? '' : formatBRL(cents).slice(3);
}

/**
 * Valor em reais digitado como a pessoa está acostumada ("49,90", "1.250").
 * Por fora trabalha sempre em centavos; vazio vira `null`.
 */
export function MoneyInput({
  valueCents,
  onValueChange,
  className,
  ...props
}: {
  valueCents: number | null;
  onValueChange: (cents: number | null) => void;
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'defaultValue'>) {
  const [texto, setTexto] = useState(() => paraTexto(valueCents));

  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-ink-500"
      >
        R$
      </span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        value={texto}
        onChange={(evento) => {
          const limpo = evento.target.value.replace(/[^\d.,]/g, '').slice(0, 14);
          setTexto(limpo);
          onValueChange(limpo.trim() ? parseBRL(limpo) : null);
        }}
        onBlur={(evento) => {
          const cents = texto.trim() ? parseBRL(texto) : null;
          if (cents !== null) setTexto(paraTexto(cents));
          props.onBlur?.(evento);
        }}
        className={cn('tabular pl-10', className)}
        {...props}
      />
    </div>
  );
}
