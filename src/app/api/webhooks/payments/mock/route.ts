import { NextResponse } from 'next/server';

import { Errors } from '@/server/errors';
import { ok, route } from '@/server/http';
import { paymentSimulationEnabled, processPaymentWebhook } from '@/server/payments/service';

const LIMITE_BYTES = 100_000;

/** Avisos do provedor de teste. O provedor real terá a própria rota, com a assinatura dele. */
export const POST = route(async ({ req, meta }) => {
  if (!paymentSimulationEnabled()) throw Errors.notFound();
  const corpo = await req.text();
  if (corpo.length > LIMITE_BYTES) throw Errors.badRequest('Corpo da requisição grande demais.');

  const resultado = await processPaymentWebhook('MOCK', req.headers, corpo);
  if (resultado === 'invalid_signature' || resultado === 'malformed') {
    return NextResponse.json(
      {
        error: {
          code: resultado === 'malformed' ? 'BAD_REQUEST' : 'UNAUTHENTICATED',
          message: resultado === 'malformed' ? 'Aviso em formato inválido.' : 'Assinatura do aviso inválida.',
          details: {},
        },
      },
      { status: resultado === 'malformed' ? 400 : 401, headers: { 'x-request-id': meta.requestId } },
    );
  }
  return ok({ result: resultado });
});
