import { Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { formatChange, formatPoints } from '@/lib/format';

import { Card } from '../ui/card';
import { cn } from '../ui/cn';

const TONS = {
  pool: 'bg-ink-50 text-ink-500 ring-ink-200/70',
  grape: 'bg-ink-50 text-ink-500 ring-ink-200/70',
  citrus: 'bg-ink-50 text-ink-500 ring-ink-200/70',
  sun: 'bg-ink-50 text-ink-500 ring-ink-200/70',
  ink: 'bg-ink-50 text-ink-500 ring-ink-200/70',
} as const;

/** Variação contra o período anterior. `inverse`: subir é ruim (ex.: cancelamentos). */
export function Delta({
  change,
  kind = 'relative',
  inverse = false,
  className,
}: {
  change: number | null;
  kind?: 'relative' | 'points';
  inverse?: boolean;
  className?: string;
}) {
  if (change === null) {
    return <span className={cn('text-[13px] text-ink-500', className)}>Sem base de comparação</span>;
  }
  const texto = kind === 'points' ? formatPoints(change) : formatChange(change);
  const bom = inverse ? change < 0 : change > 0;
  const Icone = change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[13px] font-semibold',
        change === 0 ? 'text-ink-500' : bom ? 'text-success-700' : 'text-danger-700',
        className,
      )}
    >
      <Icone className="size-3.5" aria-hidden />
      <span className="tabular">{texto}</span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  change,
  changeKind,
  inverse,
  hint,
  icon: Icone,
  tone = 'pool',
}: {
  label: string;
  value: ReactNode;
  change?: number | null;
  changeKind?: 'relative' | 'points';
  inverse?: boolean;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof TONS;
}) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-ink-500">{label}</p>
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl ring-1', TONS[tone])}>
          <Icone className="size-[18px]" aria-hidden />
        </span>
      </div>
      <p className="tabular mt-2 font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink-900 sm:text-[30px]">
        {value}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3">
        {change !== undefined ? <Delta change={change} kind={changeKind} inverse={inverse} /> : null}
        {hint ? <span className="text-[13px] text-ink-500">{hint}</span> : null}
      </div>
    </Card>
  );
}
