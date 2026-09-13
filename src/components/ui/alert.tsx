import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from './cn';

const TONS: Record<'info' | 'success' | 'warning' | 'danger', { classes: string; icon: LucideIcon }> = {
  info: { classes: 'bg-pool-50 text-pool-900 ring-pool-200', icon: Info },
  success: { classes: 'bg-success-50 text-success-800 ring-success-600/20', icon: CircleCheck },
  warning: { classes: 'bg-warning-50 text-warning-800 ring-warning-600/25', icon: TriangleAlert },
  danger: { classes: 'bg-danger-50 text-danger-800 ring-danger-600/20', icon: CircleAlert },
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONS;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { classes, icon: Icone } = TONS[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset', classes, className)}
    >
      <Icone aria-hidden className="mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-6">{children}</div> : null}
      </div>
    </div>
  );
}
