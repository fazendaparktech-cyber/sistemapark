import type { ComponentProps, ReactNode } from 'react';

import { cn } from './cn';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-2xl bg-white shadow-card ring-1 ring-ink-200/70', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6', className)}
    >
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 py-5 sm:px-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 px-5 py-4 sm:px-6',
        className,
      )}
      {...props}
    />
  );
}
