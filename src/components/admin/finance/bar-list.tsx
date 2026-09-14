import { formatBRL } from '@/lib/money';

export interface BarListItem {
  key: string;
  label: string;
  valueCents: number;
  detail?: string;
}

/** Lista com barra proporcional ao maior valor: nome e valor em cima, detalhe embaixo. */
export function BarList({ items, emptyText }: { items: BarListItem[]; emptyText: string }) {
  const maior = Math.max(0, ...items.map((item) => item.valueCents));
  if (maior === 0) return <p className="py-10 text-center text-sm text-ink-500">{emptyText}</p>;

  return (
    <ul className="grid gap-4">
      {items.map((item) => (
        <li key={item.key} className="grid gap-1.5 text-[13px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-medium text-ink-800">{item.label}</span>
            <span className="tabular shrink-0 font-semibold text-ink-900">{formatBRL(item.valueCents)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-pool-500"
              style={{ width: `${(Math.max(0, item.valueCents) / maior) * 100}%` }}
            />
          </div>
          {item.detail ? <p className="tabular text-xs text-ink-500">{item.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}
