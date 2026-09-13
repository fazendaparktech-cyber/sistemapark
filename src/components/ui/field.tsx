import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from './cn';

/*
 * Campos de formulário. Texto dos campos com 16px no celular: abaixo disso o
 * iPhone dá zoom na página ao tocar no campo.
 */

const CONTROLE =
  'block w-full rounded-xl bg-white text-base text-ink-900 ring-1 ring-inset ring-ink-200 transition-[box-shadow] ' +
  'placeholder:text-ink-400 hover:ring-ink-300 focus:outline-none focus:ring-2 focus:ring-pool-600 ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 ' +
  'aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger-600 sm:text-[15px]';

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-[13px] font-semibold text-ink-800', className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CONTROLE, 'h-11 px-3.5', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROLE, 'min-h-24 px-3.5 py-2.5', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(CONTROLE, 'h-11 appearance-none pl-3.5 pr-10')} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-500"
      />
    </div>
  );
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-[18px] shrink-0 cursor-pointer rounded-[5px] accent-pool-700 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

/** Ids de ajuda e erro de um campo, para ligar o controle ao texto com aria-describedby. */
export function fieldIds(id: string, { hint, error }: { hint?: ReactNode; error?: ReactNode }) {
  const descricoes = [hint ? `${id}-dica` : null, error ? `${id}-erro` : null].filter(Boolean).join(' ');
  return {
    'aria-describedby': descricoes || undefined,
    'aria-invalid': error ? (true as const) : undefined,
  };
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-danger-700">
            {' '}
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint ? (
        <p id={`${id}-dica`} className="text-[13px] leading-5 text-ink-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-erro`} className="text-[13px] font-medium leading-5 text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
