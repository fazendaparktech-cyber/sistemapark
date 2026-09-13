'use client';

import { Check } from 'lucide-react';

import { checkPassword, PASSWORD_MIN_LENGTH } from '@/lib/password-policy';

import { cn } from '../ui/cn';

/** Lista viva do que a nova senha precisa cumprir — a mesma regra que o servidor aplica. */
export function PasswordRequirements({
  password,
  email,
  name,
  id,
}: {
  password: string;
  email?: string;
  name?: string;
  id?: string;
}) {
  const problemas = new Set(checkPassword(password, { email, name }));
  const preenchida = password.length > 0;
  const itens = [
    {
      ok: preenchida && !problemas.has('TOO_SHORT') && !problemas.has('TOO_LONG'),
      label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
    },
    { ok: preenchida && !problemas.has('COMMON'), label: 'Não é uma senha comum' },
    { ok: preenchida && !problemas.has('CONTAINS_PERSONAL'), label: 'Não contém seu nome nem seu e-mail' },
    { ok: preenchida && !problemas.has('LOW_VARIETY'), label: 'Não repete demais os mesmos caracteres' },
  ];

  return (
    <ul id={id} className="grid gap-1.5 text-[13px]" aria-label="Requisitos da senha">
      {itens.map((item) => (
        <li
          key={item.label}
          className={cn(
            'flex items-center gap-2 transition-colors',
            item.ok ? 'text-success-700' : 'text-ink-500',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'grid size-4 shrink-0 place-items-center rounded-full ring-1 transition-colors',
              item.ok ? 'bg-success-600 text-white ring-success-600' : 'bg-white ring-ink-300',
            )}
          >
            {item.ok ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
          {item.label}
          <span className="sr-only">{item.ok ? '(atendido)' : '(pendente)'}</span>
        </li>
      ))}
    </ul>
  );
}
