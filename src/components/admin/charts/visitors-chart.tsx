'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatNumber } from '@/lib/format';

export interface VisitorsChartPoint {
  key: string;
  label: string;
  expected: number;
  checkins: number;
}

const CORES = { expected: '#b6e5f2', checkins: '#146f83' } as const;

function Dica({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { dataKey?: unknown; value?: unknown }[];
  label?: unknown;
}) {
  if (!active || !payload?.length) return null;
  const valor = (chave: string) => {
    const item = payload.find((entrada) => entrada.dataKey === chave)?.value;
    return typeof item === 'number' ? item : 0;
  };
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-sm shadow-pop ring-1 ring-ink-200">
      <p className="text-xs text-ink-500">{String(label)}</p>
      <p className="tabular text-ink-900">
        <span className="font-semibold">{formatNumber(valor('expected'))}</span> esperados
      </p>
      <p className="tabular text-ink-900">
        <span className="font-semibold">{formatNumber(valor('checkins'))}</span> entraram
      </p>
    </div>
  );
}

/** Visitantes por dia de visita: ingressos válidos para a data e entradas registradas. */
export function VisitorsChart({ points }: { points: VisitorsChartPoint[] }) {
  const esperados = points.reduce((soma, ponto) => soma + ponto.expected, 0);
  const entraram = points.reduce((soma, ponto) => soma + ponto.checkins, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="flex gap-6">
          <div>
            <dt className="text-[13px] font-semibold text-ink-500">Esperados</dt>
            <dd className="tabular font-display text-2xl font-semibold text-ink-900">
              {formatNumber(esperados)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] font-semibold text-ink-500">Entraram</dt>
            <dd className="tabular font-display text-2xl font-semibold text-pool-800">
              {formatNumber(entraram)}
            </dd>
          </div>
        </dl>
        <div className="flex gap-4 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: CORES.expected }} />
            Esperados
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: CORES.checkins }} />
            Entraram
          </span>
        </div>
      </div>
      <div className="mt-5 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="#efeef4" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#716c87', fontSize: 11 }}
              minTickGap={12}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: '#716c87', fontSize: 11 }}
            />
            <Tooltip cursor={{ fill: '#f7f7fa' }} content={<Dica />} />
            <Bar dataKey="expected" fill={CORES.expected} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="checkins" fill={CORES.checkins} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
