import type { ZodError } from 'zod';

/**
 * Erros com código estável e mensagem pronta para mostrar a quem usa o sistema.
 *
 * Toda resposta de erro da API tem o mesmo formato:
 *
 *   {"error":{"code":"TICKET_ALREADY_USED","message":"Este ingresso já foi utilizado.","details":{}}}
 *
 * Stack trace nunca vai para a resposta — fica só no log do servidor.
 */

/** Código → status HTTP. Cada módulo novo acrescenta aqui os seus códigos. */
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  INVALID_JSON: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  VALIDATION_ERROR: 422,
  INVALID_ORIGIN: 403,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_WITHOUT_ACCESS: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INVALID_RESET_TOKEN: 400,
  WEAK_PASSWORD: 422,
  LAST_SUPER_ADMIN: 409,
  SALES_UNAVAILABLE: 503,
  DATE_UNAVAILABLE: 409,
  SOLD_OUT: 409,
  LIMIT_EXCEEDED: 422,
  CART_NOT_FOUND: 404,
  CART_EXPIRED: 410,
  COUPON_INVALID: 422,
  ORDER_NOT_PAYABLE: 409,
  PAYMENT_PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type ErrorDetails = Record<string, unknown>;

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details: ErrorDetails };
}

interface AppErrorOptions {
  details?: ErrorDetails;
  headers?: Record<string, string>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetails;
  readonly headers: Record<string, string>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = options.details ?? {};
    this.headers = options.headers ?? {};
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Erros mais comuns, com a mensagem padrão em português. */
export const Errors = {
  badRequest: (message: string, details?: ErrorDetails) => new AppError('BAD_REQUEST', message, { details }),
  invalidJson: () => new AppError('INVALID_JSON', 'O corpo da requisição não é um JSON válido.'),
  unsupportedMediaType: () =>
    new AppError('UNSUPPORTED_MEDIA_TYPE', 'Envie os dados como JSON (Content-Type: application/json).'),
  invalidOrigin: () => new AppError('INVALID_ORIGIN', 'Requisição recusada: origem não autorizada.'),
  unauthenticated: () =>
    new AppError('UNAUTHENTICATED', 'Sua sessão terminou. Entre novamente para continuar.'),
  invalidCredentials: () => new AppError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.'),
  passwordChangeRequired: () =>
    new AppError('PASSWORD_CHANGE_REQUIRED', 'Defina uma nova senha antes de continuar.'),
  forbidden: (permission?: string) =>
    new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.', {
      details: permission ? { permission } : {},
    }),
  notFound: (message = 'Registro não encontrado.') => new AppError('NOT_FOUND', message),
  conflict: (message: string, details?: ErrorDetails) => new AppError('CONFLICT', message, { details }),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError('RATE_LIMITED', 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.', {
      details: { retryAfterSeconds },
      headers: { 'Retry-After': String(retryAfterSeconds) },
    }),
  internal: (cause?: unknown) =>
    new AppError('INTERNAL_ERROR', 'Algo deu errado do nosso lado. Tente de novo em instantes.', { cause }),
} as const;

/** Converte um erro do Zod em VALIDATION_ERROR com a primeira mensagem de cada campo. */
export function fromZodError(error: ZodError, message = 'Confira os dados informados.'): AppError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.') || '_';
    fields[path] ??= issue.message;
  }
  return new AppError('VALIDATION_ERROR', message, { details: { fields } });
}
