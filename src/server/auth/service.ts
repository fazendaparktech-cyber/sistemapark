import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import { checkPassword, describePasswordProblems } from '@/lib/password-policy';

import { recordAudit } from '../audit';
import { randomToken, sha256Hex } from '../crypto';
import { prisma } from '../db';
import { env } from '../env';
import { AppError, Errors } from '../errors';
import { emailProvider } from '../integrations/email';
import { passwordResetEmail } from '../integrations/email/templates';
import { logger } from '../logger';
import { clearRateLimit, consumeRateLimit, enforceRateLimit, rateLimitKey } from '../rate-limit';
import type { RequestMeta } from '../request';
import type { AuthContext } from './context';
import { hashPassword, passwordNeedsRehash, simulatePasswordCheck, verifyPassword } from './password';
import { createSession, revokeSession, revokeUserSessions, type CreatedSession } from './session';

/**
 * Login, logout e senha da equipe. Toda tentativa passa por limite de
 * tentativas e fica na auditoria. As mensagens não revelam se um e-mail tem
 * conta.
 */

export const LOGIN_LIMITS = {
  perIp: { limit: 30, windowSeconds: 15 * 60 },
  perEmailAndIp: { limit: 5, windowSeconds: 15 * 60 },
  perEmail: { limit: 50, windowSeconds: 60 * 60 },
} as const;

export const PASSWORD_RESET_TTL_MINUTES = 30;

export interface LoginResult extends CreatedSession {
  mustChangePassword: boolean;
}

export async function login(
  input: { email: string; password: string },
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();

  await enforceRateLimit({ key: rateLimitKey('login:ip', meta.ip), ...LOGIN_LIMITS.perIp }, db);
  const chaveEmailIp = rateLimitKey('login:email-ip', email, meta.ip);
  await enforceRateLimit({ key: chaveEmailIp, ...LOGIN_LIMITS.perEmailAndIp }, db);
  const porConta = await consumeRateLimit(
    { key: rateLimitKey('login:email', email), ...LOGIN_LIMITS.perEmail },
    db,
  );
  if (!porConta.allowed) {
    // Registra só a primeira recusa da janela, para um ataque não encher a auditoria.
    if (porConta.count === LOGIN_LIMITS.perEmail.limit + 1) {
      await recordAudit(db, { action: 'auth.login_throttled', data: { email }, meta });
    }
    throw Errors.rateLimited(porConta.retryAfterSeconds);
  }

  const usuario = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      passwordHash: true,
      status: true,
      mustChangePassword: true,
      roles: { select: { parkId: true, park: { select: { name: true, isActive: true } } } },
    },
  });

  if (!usuario) {
    await simulatePasswordCheck(input.password);
    await recordAudit(db, { action: 'auth.login_failed', data: { email, reason: 'UNKNOWN_EMAIL' }, meta });
    throw Errors.invalidCredentials();
  }

  if (!(await verifyPassword(usuario.passwordHash, input.password))) {
    await recordAudit(db, {
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: usuario.id,
      data: { reason: 'WRONG_PASSWORD' },
      meta,
    });
    throw Errors.invalidCredentials();
  }

  if (usuario.status !== 'ACTIVE') {
    await recordAudit(db, {
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: usuario.id,
      data: { reason: `STATUS_${usuario.status}` },
      meta,
    });
    throw new AppError('ACCOUNT_DISABLED', 'Seu acesso está desativado. Fale com a administração do parque.');
  }

  const parques = [
    ...new Map(
      usuario.roles
        .filter((v) => v.park.isActive)
        .map((v) => [v.parkId, { id: v.parkId, name: v.park.name }]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const parque = parques[0];
  if (!parque) {
    await recordAudit(db, {
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: usuario.id,
      data: { reason: 'NO_PARK_ACCESS' },
      meta,
    });
    throw new AppError(
      'ACCOUNT_WITHOUT_ACCESS',
      'Seu usuário ainda não tem acesso a nenhum parque. Fale com a administração.',
    );
  }

  const hashAtualizado = passwordNeedsRehash(usuario.passwordHash)
    ? await hashPassword(input.password)
    : null;

  const sessao = await db.$transaction(async (tx) => {
    const criada = await createSession(tx, { userId: usuario.id, parkId: parque.id, meta });
    await tx.user.update({
      where: { id: usuario.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: meta.ip,
        ...(hashAtualizado ? { passwordHash: hashAtualizado } : {}),
      },
    });
    await recordAudit(tx, {
      action: 'auth.login',
      parkId: parque.id,
      actorUserId: usuario.id,
      entityType: 'session',
      entityId: criada.sessionId,
      meta,
    });
    return criada;
  });

  await clearRateLimit(chaveEmailIp, db);
  return { ...sessao, mustChangePassword: usuario.mustChangePassword };
}

export async function logout(auth: AuthContext, meta: RequestMeta, db: PrismaClient = prisma): Promise<void> {
  await db.$transaction(async (tx) => {
    await revokeSession(tx, auth.sessionId, 'LOGOUT');
    await recordAudit(tx, {
      action: 'auth.logout',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'session',
      entityId: auth.sessionId,
      meta,
    });
  });
}

/** Envio pendente: o handler dispara depois de responder, para o tempo de resposta não revelar se a conta existe. */
export type PendingDelivery = () => Promise<void>;

/**
 * Pedido de redefinição de senha. Sempre termina igual para quem pediu; só
 * gera e-mail se a conta existe e está ativa.
 */
export async function requestPasswordReset(
  input: { email: string },
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<PendingDelivery | null> {
  const email = input.email.trim().toLowerCase();
  await enforceRateLimit({ key: rateLimitKey('reset:ip', meta.ip), limit: 10, windowSeconds: 60 * 60 }, db);
  const porEmail = await consumeRateLimit(
    { key: rateLimitKey('reset:email', email), limit: 3, windowSeconds: 60 * 60 },
    db,
  );
  if (!porEmail.allowed) return null;

  const usuario = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      roles: { select: { park: { select: { id: true, name: true } } }, take: 1 },
    },
  });
  if (!usuario || usuario.status !== 'ACTIVE') return null;

  const token = randomToken(32);
  const tokenHash = sha256Hex(token);
  const parque = usuario.roles[0]?.park ?? null;

  await db.$transaction(async (tx) => {
    // Um link por vez: pedir de novo invalida os anteriores.
    await tx.passwordResetToken.updateMany({
      where: { userId: usuario.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: usuario.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
        requestedIp: meta.ip,
      },
    });
    await recordAudit(tx, {
      action: 'auth.password_reset_requested',
      parkId: parque?.id ?? null,
      entityType: 'user',
      entityId: usuario.id,
      meta,
    });
  });

  const mensagem = passwordResetEmail({
    name: usuario.name,
    parkName: parque?.name ?? 'Conquista Park',
    url: `${env().APP_URL}/redefinir-senha?token=${encodeURIComponent(token)}`,
    expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
  });

  return async () => {
    try {
      await emailProvider().send({
        to: usuario.email,
        ...mensagem,
        tag: 'password_reset',
        idempotencyKey: `password-reset-${tokenHash.slice(0, 32)}`,
      });
    } catch (erro) {
      logger.error({ err: erro, userId: usuario.id }, 'falha ao enviar e-mail de redefinição de senha');
    }
  };
}

function erroLinkInvalido(): AppError {
  return new AppError('INVALID_RESET_TOKEN', 'Este link expirou ou já foi usado. Peça um novo link.');
}

function erroSenhaFraca(problemas: ReturnType<typeof checkPassword>, campo: string): AppError {
  const mensagem = describePasswordProblems(problemas);
  return new AppError('WEAK_PASSWORD', mensagem, {
    details: { problems: problemas, fields: { [campo]: mensagem } },
  });
}

export async function resetPassword(
  input: { token: string; password: string },
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<void> {
  await enforceRateLimit(
    { key: rateLimitKey('reset-confirm:ip', meta.ip), limit: 20, windowSeconds: 60 * 60 },
    db,
  );
  if (input.token.length < 32 || input.token.length > 128) throw erroLinkInvalido();

  const registro = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256Hex(input.token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: {
        select: { name: true, email: true, status: true, roles: { select: { parkId: true }, take: 1 } },
      },
    },
  });
  if (!registro || registro.usedAt || registro.expiresAt <= new Date() || registro.user.status !== 'ACTIVE') {
    throw erroLinkInvalido();
  }

  const problemas = checkPassword(input.password, { email: registro.user.email, name: registro.user.name });
  if (problemas.length > 0) throw erroSenhaFraca(problemas, 'password');

  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async (tx) => {
    // Consumo atômico: dois cliques no mesmo link não trocam a senha duas vezes.
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: registro.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw erroLinkInvalido();

    await tx.passwordResetToken.updateMany({
      where: { userId: registro.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.user.update({
      where: { id: registro.userId },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    });
    await revokeUserSessions(tx, registro.userId, 'PASSWORD_RESET');
    await recordAudit(tx, {
      action: 'auth.password_reset',
      parkId: registro.user.roles[0]?.parkId ?? null,
      actorUserId: registro.userId,
      entityType: 'user',
      entityId: registro.userId,
      meta,
    });
  });
}

export async function changePassword(
  auth: AuthContext,
  input: { currentPassword: string; newPassword: string },
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<void> {
  await enforceRateLimit(
    { key: rateLimitKey('password-change', auth.user.id), limit: 10, windowSeconds: 15 * 60 },
    db,
  );

  const usuario = await db.user.findUnique({
    where: { id: auth.user.id },
    select: { passwordHash: true, name: true, email: true },
  });
  if (!usuario) throw Errors.unauthenticated();

  if (!(await verifyPassword(usuario.passwordHash, input.currentPassword))) {
    throw new AppError('VALIDATION_ERROR', 'A senha atual não confere.', {
      details: { fields: { currentPassword: 'A senha atual não confere.' } },
    });
  }
  if (input.newPassword === input.currentPassword) {
    throw new AppError('WEAK_PASSWORD', 'A nova senha precisa ser diferente da atual.', {
      details: { fields: { newPassword: 'A nova senha precisa ser diferente da atual.' } },
    });
  }
  const problemas = checkPassword(input.newPassword, { email: usuario.email, name: usuario.name });
  if (problemas.length > 0) throw erroSenhaFraca(problemas, 'newPassword');

  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: auth.user.id },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    });
    await revokeUserSessions(tx, auth.user.id, 'PASSWORD_CHANGED', { exceptSessionId: auth.sessionId });
    await recordAudit(tx, {
      action: 'auth.password_changed',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'user',
      entityId: auth.user.id,
      meta,
    });
  });
}
