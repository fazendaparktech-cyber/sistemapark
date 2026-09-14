import type { DateOnly } from './dates';
import type { TicketStatusKey } from './orders';
import { uuidSchema, z } from './validation';

/** Ingressos e portaria: situação do ingresso na data de hoje e os motivos de entrada negada. */

/** Situações que a equipe filtra na lista de ingressos. */
export const TICKET_FILTER_STATUSES = [
  'ACTIVE',
  'CHECKED_IN',
  'PENDING_PAYMENT',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
] as const;

/**
 * Situação real do ingresso: válido (ou aguardando pagamento) de uma data que
 * já passou conta como expirado, mesmo antes da rotina de limpeza marcar no banco.
 */
export function effectiveTicketStatus(
  ticket: { status: TicketStatusKey; visitDate: DateOnly },
  today: DateOnly,
): TicketStatusKey {
  if ((ticket.status === 'ACTIVE' || ticket.status === 'PENDING_PAYMENT') && ticket.visitDate < today) {
    return 'EXPIRED';
  }
  return ticket.status;
}

export const CHECKIN_REASONS = [
  'ALREADY_USED',
  'CANCELLED',
  'REFUNDED',
  'PENDING_PAYMENT',
  'EXPIRED',
  'WRONG_DATE',
  'NOT_FOUND',
  'INVALID_QR',
] as const;
export type CheckinReasonKey = (typeof CHECKIN_REASONS)[number];

export const CHECKIN_REASON_LABELS: Readonly<Record<CheckinReasonKey, string>> = {
  ALREADY_USED: 'Ingresso já utilizado',
  CANCELLED: 'Ingresso cancelado',
  REFUNDED: 'Ingresso reembolsado',
  PENDING_PAYMENT: 'Pagamento pendente',
  EXPIRED: 'Ingresso expirado',
  WRONG_DATE: 'Ingresso para outra data',
  NOT_FOUND: 'Ingresso não encontrado',
  INVALID_QR: 'QR Code inválido',
};

export const CHECKIN_METHOD_LABELS = { QR: 'QR Code', MANUAL: 'Busca manual' } as const;

export const TICKET_EVENT_LABELS: Readonly<Record<string, string>> = {
  CREATED: 'Ingresso emitido',
  ACTIVATED: 'Ingresso liberado para uso',
  CHECKED_IN: 'Entrada registrada',
  CANCELLED: 'Ingresso cancelado',
  REFUNDED: 'Ingresso reembolsado',
  EXPIRED: 'Ingresso expirado',
  REISSUED: 'QR Code reemitido',
  RESENT: 'Ingresso reenviado',
  HOLDER_CHANGED: 'Visitante alterado',
};

const dispositivo = z
  .string()
  .trim()
  .max(120)
  .nullish()
  .transform((valor) => (valor ? valor : null));

export const checkinScanSchema = z.strictObject({
  payload: z.string({ error: 'Leia o QR Code' }).trim().min(1, 'Leia o QR Code').max(300, 'QR Code inválido'),
  device: dispositivo,
});

export const checkinManualSchema = z.strictObject({
  ticketId: uuidSchema,
  device: dispositivo,
});

export type CheckinScanInput = z.input<typeof checkinScanSchema>;
export type CheckinManualInput = z.input<typeof checkinManualSchema>;
