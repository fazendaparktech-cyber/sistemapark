'use client';

import type { RoleKey } from '@/lib/access';

import { cn } from '../../ui/cn';
import { Checkbox } from '../../ui/field';

export interface RoleOption {
  key: RoleKey;
  name: string;
  description: string | null;
}

/** Escolha de papéis com nome e descrição de cada um. */
export function RoleCheckboxes({
  options,
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  options: RoleOption[];
  value: readonly RoleKey[];
  onChange: (roles: RoleKey[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  function alternar(papel: RoleKey, marcado: boolean) {
    onChange(marcado ? [...value, papel] : value.filter((atual) => atual !== papel));
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opcao) => {
        const id = `${idPrefix}-${opcao.key}`;
        const marcado = value.includes(opcao.key);
        return (
          <label
            key={opcao.key}
            htmlFor={id}
            className={cn(
              'flex cursor-pointer gap-3 rounded-xl px-3.5 py-3 ring-1 ring-inset transition-colors',
              marcado ? 'bg-pool-50/70 ring-pool-300' : 'bg-white ring-ink-200 hover:ring-ink-300',
              disabled && 'cursor-not-allowed opacity-70',
            )}
          >
            <Checkbox
              id={id}
              checked={marcado}
              disabled={disabled}
              onChange={(evento) => alternar(opcao.key, evento.target.checked)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink-900">{opcao.name}</span>
              {opcao.description ? (
                <span className="mt-0.5 block text-[13px] leading-5 text-ink-500">{opcao.description}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
