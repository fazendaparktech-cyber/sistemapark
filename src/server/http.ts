import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import type { ZodType, z } from 'zod';

import { uuidSchema } from '@/lib/validation';

import { AppError, Errors, fromZodError, isAppError } from './errors';
import { logger, type Logger } from './logger';
import { requestMeta, type RequestMeta } from './request';

/**
 * Casca comum dos Route Handlers: request id, log, leitura segura do corpo e
 * resposta de erro no formato padrão. A regra de negócio fica no serviço; o
 * handler só autentica, autoriza, valida e chama.
 */

const LIMITE_CORPO_BYTES = 1_000_000;

export interface HandlerArgs<Ctx> {
  req: NextRequest;
  ctx: Ctx;
  meta: RequestMeta;
  log: Logger;
}

export function route<Ctx = unknown>(handler: (args: HandlerArgs<Ctx>) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    const meta = requestMeta(req.headers);
    const log = logger.child({ requestId: meta.requestId, method: req.method, path: req.nextUrl.pathname });
    try {
      const resposta = await handler({ req, ctx, meta, log });
      resposta.headers.set('x-request-id', meta.requestId);
      return resposta;
    } catch (erro) {
      return errorResponse(erro, meta, log);
    }
  };
}

export function errorResponse(erro: unknown, meta: RequestMeta, log: Logger): Response {
  const appError: AppError = isAppError(erro) ? erro : Errors.internal(erro);
  if (appError.status >= 500) {
    log.error({ err: erro }, 'erro interno');
  } else {
    log.info({ code: appError.code, status: appError.status }, 'requisição recusada');
  }
  return NextResponse.json(appError.toBody(), {
    status: appError.status,
    headers: { ...appError.headers, 'x-request-id': meta.requestId, 'cache-control': 'no-store' },
  });
}

/** Lê e valida um corpo JSON. Recusa outro Content-Type, JSON quebrado e corpo grande demais. */
export async function readJson<S extends ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const tipo = req.headers.get('content-type') ?? '';
  if (!tipo.toLowerCase().startsWith('application/json')) throw Errors.unsupportedMediaType();

  const tamanho = Number(req.headers.get('content-length') ?? '0');
  if (tamanho > LIMITE_CORPO_BYTES) throw Errors.badRequest('Corpo da requisição grande demais.');

  const texto = await req.text();
  if (texto.length > LIMITE_CORPO_BYTES) throw Errors.badRequest('Corpo da requisição grande demais.');

  let corpo: unknown;
  try {
    corpo = texto ? JSON.parse(texto) : {};
  } catch {
    throw Errors.invalidJson();
  }

  const resultado = schema.safeParse(corpo);
  if (!resultado.success) throw fromZodError(resultado.error);
  return resultado.data;
}

/** Valida query string. */
export function readQuery<S extends ZodType>(req: NextRequest, schema: S): z.infer<S> {
  const resultado = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!resultado.success) throw fromZodError(resultado.error);
  return resultado.data;
}

/** Resposta de sucesso: `{ "data": … }`, nunca guardada em cache. */
export function ok<T>(data: T, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  return NextResponse.json({ data }, { ...init, headers });
}

/** Contexto de rotas com `[id]`. */
export interface IdRouteContext {
  params: Promise<{ id: string }>;
}

/** Lê o `[id]` da rota; id que não é UUID é tratado como inexistente. */
export async function readIdParam(ctx: IdRouteContext): Promise<string> {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) throw Errors.notFound();
  return id;
}
