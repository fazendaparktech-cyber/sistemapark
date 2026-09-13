'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';

import { cn } from './cn';
import { Input } from './field';

/** Campo de senha com botão para mostrar e esconder o que foi digitado. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className={cn('relative', className)}>
      <Input
        type={visivel ? 'text' : 'password'}
        className="pr-12"
        autoCapitalize="none"
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
        aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
        aria-pressed={visivel}
      >
        {visivel ? (
          <EyeOff className="size-[18px]" aria-hidden />
        ) : (
          <Eye className="size-[18px]" aria-hidden />
        )}
      </button>
    </div>
  );
}
