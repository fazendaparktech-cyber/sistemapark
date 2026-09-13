import 'server-only';

import pino from 'pino';

/**
 * Log estruturado em JSON, uma linha por evento. Campos sensíveis são
 * removidos antes de sair do processo — nem senha, nem token, nem CPF chegam
 * ao provedor de logs.
 */

const CAMPOS_REMOVIDOS = [
  'password',
  'newPassword',
  'currentPassword',
  'temporaryPassword',
  'passwordHash',
  'token',
  'tokenHash',
  'cpf',
  'authorization',
  'cookie',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.temporaryPassword',
  '*.passwordHash',
  '*.token',
  '*.tokenHash',
  '*.cpf',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'sistemapark' },
  messageKey: 'message',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: { paths: CAMPOS_REMOVIDOS, censor: '[removido]' },
});

export type Logger = typeof logger;
