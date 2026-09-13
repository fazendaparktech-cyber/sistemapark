import 'server-only';

import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

/** O que se sabe sobre quem fez a requisição — vai para auditoria e logs. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

/**
 * IP de quem acessa. Em produção o sistema fica atrás do proxy da hospedagem,
 * que preenche `x-real-ip`/`x-forwarded-for`; valores que não são IP são
 * ignorados.
 */
export function clientIp(headers: Headers): string | null {
  const real = headers.get('x-real-ip')?.trim();
  if (real && isIP(real)) return real;
  const encaminhado = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (encaminhado && isIP(encaminhado)) return encaminhado;
  return null;
}

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export function requestMeta(headers: Headers): RequestMeta {
  const recebido = headers.get('x-request-id');
  return {
    ip: clientIp(headers),
    userAgent: headers.get('user-agent')?.slice(0, 400) ?? null,
    requestId: recebido && REQUEST_ID.test(recebido) ? recebido : randomUUID(),
  };
}
