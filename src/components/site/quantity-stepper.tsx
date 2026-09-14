'use client';

import { Minus, Plus } from 'lucide-react';

import { cn } from '../ui/cn';

/** Menos, quantidade, mais. Botões grandes para o dedo no celular. */
export function QuantityStepper({
  value,
  max,
  onChange,
  label,
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (valor: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const botao =
    'grid size-10 place-items-center rounded-full ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Quantidade de ${label}`}>
      <button
        type="button"
        className={cn(botao, 'bg-white text-ink-700 ring-ink-300 hover:bg-ink-50')}
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
        aria-label={`Tirar um ${label}`}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <output
        aria-live="polite"
        className="tabular w-7 text-center font-display text-lg font-semibold text-ink-900"
      >
        {value}
      </output>
      <button
        type="button"
        className={cn(botao, 'bg-pool-700 text-white ring-pool-700 hover:bg-pool-800')}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Adicionar um ${label}`}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
