import { formatPercent } from '@/lib/format';

import { cn } from '../ui/cn';

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
  detail?: string;
}

const BARRAS = {
  pool: 'bg-pool-500',
  grape: 'bg-grape-500',
  sun: 'bg-sun-400',
  citrus: 'bg-citrus-500',
} as const;

/** Ranking com barra proporcional e participação no total. */
export function BarList({
  items,
  emptyText,
  tone = 'pool',
}: {
  items: BarListItem[];
  emptyText: string;
  tone?: keyof typeof BARRAS;
}) {
  const total = items.reduce((soma, item) => soma + item.value, 0);
  if (items.length === 0 || total === 0) {
    return <p className="py-6 text-center text-sm text-ink-500">{emptyText}</p>;
  }
  const maior = Math.max(...items.map((item) => item.value));

  return (
    <ul className="grid gap-3.5">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-ink-800">{item.label}</span>
            <span className="tabular shrink-0 font-semibold text-ink-900">{item.valueLabel}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
              <div
                className={cn('h-full rounded-full', BARRAS[tone])}
                style={{ width: `${Math.max(2, (item.value / maior) * 100)}%` }}
              />
            </div>
            <span className="tabular w-12 shrink-0 text-right text-xs text-ink-500">
              {formatPercent(item.value / total)}
            </span>
          </div>
          {item.detail ? <p className="mt-1 text-xs text-ink-500">{item.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}
