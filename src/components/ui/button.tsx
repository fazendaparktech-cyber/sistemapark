import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from './cn';
import { Spinner } from './feedback';

const VARIANTES = {
  primary:
    'bg-pool-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(7_48_58/0.3)] hover:bg-pool-800 active:bg-pool-900',
  secondary: 'bg-white text-ink-800 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-danger-700 text-white hover:bg-danger-800',
  'danger-soft': 'bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-600/20 hover:bg-danger-100',
  cta: 'bg-sun-400 text-ink-950 shadow-[0_2px_0_var(--color-sun-600)] hover:bg-sun-300 active:shadow-none',
} as const;

const TAMANHOS = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-5 text-base',
  icon: 'size-10 rounded-xl',
} as const;

export type ButtonVariant = keyof typeof VARIANTES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof TAMANHOS;
  loading?: boolean;
  /** Renderiza o filho (ex.: um Link) com a aparência de botão. */
  asChild?: boolean;
}

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: keyof typeof TAMANHOS = 'md',
  className?: string,
) {
  return cn(
    'inline-flex select-none items-center justify-center font-semibold whitespace-nowrap',
    'transition-[background-color,box-shadow,color,transform] duration-150 active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55',
    VARIANTES[variant],
    TAMANHOS[size],
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={buttonClasses(variant, size, className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" label="Aguarde" /> : null}
      {children}
    </button>
  );
}
