import 'server-only';

import {
  effectiveOrderStatus,
  normalizeOrderCode,
  type OrderStatusKey,
  type PaymentStatusKey,
} from '@/lib/orders';

import { prisma, type DbClient } from '../db';
import { isOrderAccessTokenValid } from '../signing';

/** Pedido aberto pelo link do cliente (número + token). Sem token válido, `null`. */
export async function findAccessibleOrder(
  parkId: string,
  codigoInformado: string,
  token: string | null | undefined,
  db: DbClient = prisma,
) {
  const code = normalizeOrderCode(codigoInformado);
  if (!code || !token) return null;
  const pedido = await db.order.findUnique({
    where: { parkId_code: { parkId, code } },
    select: { id: true, code: true, status: true, expiresAt: true, accessVersion: true, totalCents: true },
  });
  if (!pedido || !isOrderAccessTokenValid(pedido, token)) return null;
  return pedido;
}

/** Consulta leve para a página do pedido acompanhar o pagamento. */
export async function getPublicOrderStatus(
  parkId: string,
  codigoInformado: string,
  token: string | null | undefined,
  db: DbClient = prisma,
): Promise<{ status: OrderStatusKey; paymentStatus: PaymentStatusKey | null } | null> {
  const pedido = await findAccessibleOrder(parkId, codigoInformado, token, db);
  if (!pedido) return null;
  const pagamento = await db.payment.findFirst({
    where: { orderId: pedido.id },
    orderBy: { createdAt: 'desc' },
    select: { status: true },
  });
  return { status: effectiveOrderStatus(pedido), paymentStatus: pagamento?.status ?? null };
}
