'use client';

import { useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatCompactBRL, formatNumber } from '@/lib/format';
import { formatBRL } from '@/lib/money';

import { cn } from '../../ui/cn';

export interface SalesChartPoint {
  key: string;
  label: string;
  revenueCents: number;
  orders: number;
  tickets: number;
}

type Metrica = 'revenueCents' | 'orders' | 'tickets';

const ROTULOS: Record<Metrica, { aba: string; titulo: string }> = {
  revenueCents: { aba: 'Receita', titulo: 'Receita no período' },
  orders: { aba: 'Pedidos', titulo: 'Pedidos pagos no período' },
  tickets: { aba: 'Ingressos', titulo: 'Ingressos vendidos no período' },
};

function formatar(metrica: Metrica, valor: number): string {
  return metrica === 'revenueCents' ? formatBRL(valor) : formatNumber(valor);
}

function Dica({
  active,
  payload,
  label,
  metrica,
}: {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: unknown;
  metrica: Metrica;
}) {
  const valor = payload?.[0]?.value;
  if (!active || typeof valor !== 'number') return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-sm shadow-pop ring-1 ring-ink-200">
      <p className="text-xs text-ink-500">{String(label)}</p>
      <p className="tabular font-semibold text-ink-900">{formatar(metrica, valor)}</p>
    </div>
  );
}

export function SalesChart({ points, showRevenue }: { points: SalesChartPoint[]; showRevenue: boolean }) {
  const opcoes: Metrica[] = showRevenue ? ['revenueCents', 'orders', 'tickets'] : ['orders', 'tickets'];
  const [metrica, setMetrica] = useState<Metrica>(opcoes[0] ?? 'orders');
  const gradiente = `vendas-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const total = points.reduce((soma, ponto) => soma + ponto[metrica], 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink-500">{ROTULOS[metrica].titulo}</p>
          <p className="tabular mt-0.5 font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">
            {formatar(metrica, total)}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Indicador do gráfico"
          className="inline-flex rounded-xl bg-ink-100 p-1"
        >
          {opcoes.map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="tab"
              aria-selected={metrica === opcao}
              onClick={() => setMetrica(opcao)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
                metrica === opcao ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800',
              )}
            >
              {ROTULOS[opcao].aba}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1789a1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#1789a1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#efeef4" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#716c87', fontSize: 12 }}
              minTickGap={28}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={metrica === 'revenueCents' ? 76 : 40}
              tick={{ fill: '#716c87', fontSize: 12 }}
              tickFormatter={(valor: number) =>
                metrica === 'revenueCents' ? formatCompactBRL(valor) : formatNumber(valor)
              }
            />
            <Tooltip cursor={{ stroke: '#b6e5f2', strokeWidth: 2 }} content={<Dica metrica={metrica} />} />
            <Area
              type="monotone"
              dataKey={metrica}
              stroke="#146f83"
              strokeWidth={2.25}
              fill={`url(#${gradiente})`}
              activeDot={{ r: 4, fill: '#146f83', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
