import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from './cn';

export function Spinner({ className, label = 'Carregando' }: { className?: string; label?: string }) {
  return (
    <svg
      className={cn('size-5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-ink-100', className)} />;
}

export function EmptyState({
  icon: Icone,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-pool-50 text-pool-700 ring-1 ring-pool-100">
        <Icone className="size-6" aria-hidden />
      </span>
      <h3 className="mt-4 font-display text-base font-semibold text-ink-900">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
