import type { CouponState } from '@/lib/coupon-schemas';
import { COUPON_STATE_LABELS } from '@/lib/coupon-schemas';
import {
  FINANCIAL_STATUS_LABELS,
  ORDER_CHANNEL_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  type FinancialStatusKey,
  type OrderChannelKey,
  type OrderStatusKey,
  type PaymentStatusKey,
  type TicketStatusKey,
} from '@/lib/orders';

import { Badge, type BadgeTone } from '../ui/badge';

/** A mesma situação sempre com a mesma cor, em qualquer tela do painel. */

const TOM_DO_PEDIDO: Record<OrderStatusKey, BadgeTone> = {
  PENDING_PAYMENT: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'neutral',
};

const TOM_FINANCEIRO: Record<FinancialStatusKey, BadgeTone> = {
  UNPAID: 'neutral',
  PAID: 'success',
  PARTIALLY_REFUNDED: 'grape',
  REFUNDED: 'grape',
  NOT_APPLICABLE: 'neutral',
};

const TOM_DO_INGRESSO: Record<TicketStatusKey, BadgeTone> = {
  PENDING_PAYMENT: 'warning',
  ACTIVE: 'info',
  CHECKED_IN: 'dark',
  CANCELLED: 'danger',
  REFUNDED: 'grape',
  EXPIRED: 'neutral',
};

const TOM_DO_PAGAMENTO: Record<PaymentStatusKey, BadgeTone> = {
  AWAITING: 'warning',
  PROCESSING: 'warning',
  APPROVED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
  PARTIALLY_REFUNDED: 'grape',
  REFUNDED: 'grape',
  CHARGEBACK: 'danger',
};

const TOM_DO_CUPOM: Record<CouponState, BadgeTone> = {
  ACTIVE: 'success',
  SCHEDULED: 'info',
  ENDED: 'neutral',
  EXHAUSTED: 'warning',
  INACTIVE: 'neutral',
};

export function OrderStatusBadge({ status }: { status: OrderStatusKey }) {
  return (
    <Badge tone={TOM_DO_PEDIDO[status]} dot>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function FinancialStatusBadge({ status }: { status: FinancialStatusKey }) {
  return <Badge tone={TOM_FINANCEIRO[status]}>{FINANCIAL_STATUS_LABELS[status]}</Badge>;
}

export function TicketStatusBadge({ status }: { status: TicketStatusKey }) {
  return (
    <Badge tone={TOM_DO_INGRESSO[status]} dot>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatusKey }) {
  return (
    <Badge tone={TOM_DO_PAGAMENTO[status]} dot>
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function CouponStateBadge({ state }: { state: CouponState }) {
  return (
    <Badge tone={TOM_DO_CUPOM[state]} dot>
      {COUPON_STATE_LABELS[state]}
    </Badge>
  );
}

export function ChannelBadge({ channel }: { channel: OrderChannelKey }) {
  return <Badge tone={channel === 'COURTESY' ? 'citrus' : 'neutral'}>{ORDER_CHANNEL_LABELS[channel]}</Badge>;
}
