'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { AudienceSlice } from '@/lib/audience';
import { formatNumber, formatPercent } from '@/lib/format';

const CORES = ['#146f83', '#2bb3cf', '#7c5cc4', '#f2b92c', '#9bc53d', '#e0776a', '#5b8def', '#94a3b8'];
const COR_SEM_INFORMACAO = '#e2e6ed';

/** Gráfico de pizza (rosca) com legenda: quantidade e percentual de cada fatia. */
export function PieBreakdown({ slices, emptyText }: { slices: AudienceSlice[]; emptyText: string }) {
  const total = slices.reduce((soma, fatia) => soma + fatia.value, 0);
  if (total === 0 || slices.every((fatia) => fatia.key.startsWith('sem-'))) {
    return <p className="py-10 text-center text-sm text-ink-500">{emptyText}</p>;
  }

  let proxima = 0;
  const cores = slices.map((fatia) =>
    fatia.key.startsWith('sem-') ? COR_SEM_INFORMACAO : CORES[proxima++ % CORES.length],
  );

  return (
    <div className="grid gap-4">
      <div className="mx-auto size-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="100%"
              paddingAngle={1}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((fatia, indice) => (
                <Cell key={fatia.key} fill={cores[indice]} />
              ))}
            </Pie>
            <Tooltip formatter={(valor) => [formatNumber(Number(valor)), 'Clientes']} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid gap-1.5">
        {slices.map((fatia, indice) => (
          <li key={fatia.key} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: cores[indice] }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-700">{fatia.label}</span>
            <span className="tabular text-ink-900">{formatNumber(fatia.value)}</span>
            <span className="tabular w-12 text-right text-ink-500">{formatPercent(fatia.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
