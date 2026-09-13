import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '../ui/card';
import { cn } from '../ui/cn';

const TONS = {
  pool: 'bg-pool-50 text-pool-700 ring-pool-100',
  grape: 'bg-grape-50 text-grape-600 ring-grape-100',
  citrus: 'bg-citrus-100 text-citrus-700 ring-citrus-200',
  sun: 'bg-sun-50 text-sun-700 ring-sun-100',
} as const;

export function MetricCard({
  label,
  value,
  hint,
  icon: Icone,
  tone = 'pool',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof TONS;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-ink-500">{label}</p>
        <span className={cn('grid size-9 place-items-center rounded-xl ring-1', TONS[tone])}>
          <Icone className="size-[18px]" aria-hidden />
        </span>
      </div>
      <p className="tabular mt-2 font-display text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink-900">
        {value}
      </p>
      {hint ? <p className="mt-2 text-[13px] text-ink-500">{hint}</p> : null}
    </Card>
  );
}
