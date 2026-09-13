import type { ReactNode } from 'react';

import { cn } from './cn';

const TONS = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  info: 'bg-pool-50 text-pool-800 ring-pool-200',
  success: 'bg-success-50 text-success-800 ring-success-600/20',
  warning: 'bg-warning-50 text-warning-800 ring-warning-600/25',
  danger: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  grape: 'bg-grape-50 text-grape-700 ring-grape-200',
  citrus: 'bg-citrus-100 text-citrus-800 ring-citrus-400/50',
  dark: 'bg-ink-800 text-white ring-ink-800',
} as const;

export type BadgeTone = keyof typeof TONS;

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        TONS[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/**
 * Selos de situação usados em todo o sistema — a mesma palavra sempre com a
 * mesma cor, em qualquer tela.
 */
export const STATUS_BADGES = {
  PAGO: { label: 'Pago', tone: 'success' },
  PENDENTE: { label: 'Pendente', tone: 'warning' },
  CANCELADO: { label: 'Cancelado', tone: 'danger' },
  REEMBOLSADO: { label: 'Reembolsado', tone: 'grape' },
  REEMBOLSADO_PARCIAL: { label: 'Reembolso parcial', tone: 'grape' },
  ATIVO: { label: 'Ativo', tone: 'info' },
  UTILIZADO: { label: 'Utilizado', tone: 'dark' },
  EXPIRADO: { label: 'Expirado', tone: 'neutral' },
  CORTESIA: { label: 'Cortesia', tone: 'citrus' },
  SUSPENSO: { label: 'Suspenso', tone: 'warning' },
  DESATIVADO: { label: 'Desativado', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

export type StatusBadgeKey = keyof typeof STATUS_BADGES;

export function StatusBadge({ status, className }: { status: StatusBadgeKey; className?: string }) {
  const { label, tone } = STATUS_BADGES[status];
  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}
