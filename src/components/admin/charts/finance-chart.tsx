'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompactBRL } from '@/lib/format';
import { formatBRL } from '@/lib/money';

export interface FinanceChartPoint {
  key: string;
  label: string;
  grossCents: number;
  refundsCents: number;
  netCents: number;
}

const SERIES = [
  { chave: 'grossCents', rotulo: 'Bruto', cor: '#9bd9e8' },
  { chave: 'refundsCents', rotulo: 'Reembolsos', cor: '#7c5cc4' },
  { chave: 'netCents', rotulo: 'Líquido', cor: '#146f83' },
] as const;

function Dica({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) {
  const ponto = payload?.[0]?.payload as FinanceChartPoint | undefined;
  if (!active || !ponto) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-sm shadow-pop ring-1 ring-ink-200">
      <p className="text-xs text-ink-500">{ponto.label}</p>
      {SERIES.map((serie) => (
        <p key={serie.chave} className="tabular flex items-center gap-2 text-ink-900">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: serie.cor }} />
          <span className="text-ink-600">{serie.rotulo}</span>
          <span className="ml-auto pl-4 font-semibold">{formatBRL(ponto[serie.chave])}</span>
        </p>
      ))}
    </div>
  );
}

/** Receita por dia: bruto e reembolsos em barras, líquido em linha. */
export function FinanceChart({ points }: { points: FinanceChartPoint[] }) {
  return (
    <div>
      <div className="flex flex-wrap justify-end gap-4 text-xs text-ink-500">
        {SERIES.map((serie) => (
          <span key={serie.chave} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: serie.cor }} />
            {serie.rotulo}
          </span>
        ))}
      </div>
      <div className="mt-4 h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#efeef4" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#716c87', fontSize: 12 }}
              minTickGap={20}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={76}
              tick={{ fill: '#716c87', fontSize: 12 }}
              tickFormatter={(valor: number) => formatCompactBRL(valor)}
            />
            <Tooltip cursor={{ fill: '#f5f4f8' }} content={<Dica />} />
            <Bar dataKey="grossCents" fill={SERIES[0].cor} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="refundsCents" fill={SERIES[1].cor} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Line
              type="monotone"
              dataKey="netCents"
              stroke={SERIES[2].cor}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4, fill: SERIES[2].cor, stroke: '#fff', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
