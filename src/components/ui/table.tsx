import type { ComponentProps } from 'react';

import { cn } from './cn';

/** Tabela com rolagem horizontal própria: no celular a página não estoura para os lados. */
export function TableContainer({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-ink-200/70', className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />;
}

export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-ink-50/70 text-xs text-ink-500', className)} {...props} />;
}

export function TBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />;
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-t border-ink-100 transition-colors', className)} {...props} />;
}

export function TH({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('px-4 py-3 font-semibold whitespace-nowrap', className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle text-ink-800', className)} {...props} />;
}
