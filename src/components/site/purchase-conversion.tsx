'use client';

import { useEffect } from 'react';

import { takePendingPurchase, trackPixel, whenPixelsReady } from '@/lib/tracking-client';

/**
 * Conversão de compra nos pixels: dispara uma vez, só no navegador onde a
 * compra foi feita (quem abre o link do pedido depois não conta de novo).
 */
export function PurchaseConversion({
  code,
  valueCents,
  quantity,
}: {
  code: string;
  valueCents: number;
  quantity: number;
}) {
  useEffect(
    () =>
      whenPixelsReady(() => {
        if (takePendingPurchase(code)) trackPixel('Purchase', { valueCents, quantity, orderCode: code });
      }),
    [code, valueCents, quantity],
  );
  return null;
}
