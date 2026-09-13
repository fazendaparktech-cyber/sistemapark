import 'server-only';

import { formatOrderCode } from '@/lib/orders';

import type { Tx } from '../db';

/**
 * Próximo número de pedido do parque no ano (CP-2026-000128). A linha da
 * sequência fica travada até o fim da transação: compras simultâneas nunca
 * recebem o mesmo número, e uma compra desfeita não deixa buraco.
 */
export async function nextOrderCode(
  tx: Tx,
  park: { id: string; orderCodePrefix: string },
  year: number,
): Promise<string> {
  const [linha] = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO order_sequences (park_id, year, last_value)
    VALUES (${park.id}::uuid, ${year}::int, 1)
    ON CONFLICT (park_id, year) DO UPDATE SET last_value = order_sequences.last_value + 1
    RETURNING last_value`;
  if (!linha) throw new Error('Falha ao gerar o número do pedido.');
  return formatOrderCode(park.orderCodePrefix, year, linha.last_value);
}
