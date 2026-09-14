'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatNumber } from '@/lib/format';

function Dica({
  active,
  payload,
  label,
  singular,
  pluralForma,
}: {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: unknown;
  singular: string;
  pluralForma: string;
}) {
  const valor = payload?.[0]?.value;
  if (!active || typeof valor !== 'number') return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-sm shadow-pop ring-1 ring-ink-200">
      <p className="text-xs text-ink-500">{String(label)}</p>
      <p className="tabular font-semibold text-ink-900">
        {formatNumber(valor)} {valor === 1 ? singular : pluralForma}
      </p>
    </div>
  );
}

/** Colunas simples (ex.: pedidos por hora, ingressos por dia da semana). */
export function ColumnChart({
  data,
  singular,
  plural,
  color = '#7a56ab',
}: {
  data: { label: string; value: number }[];
  singular: string;
  plural: string;
  color?: string;
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#efeef4" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#716c87', fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={6}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fill: '#716c87', fontSize: 11 }}
          />
          <Tooltip cursor={{ fill: '#f7f7fa' }} content={<Dica singular={singular} pluralForma={plural} />} />
          <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={30} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
