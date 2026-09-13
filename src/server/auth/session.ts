import 'server-only';

import { loadAccess } from '../access/service';
import { randomToken, sha256Hex } from '../crypto';
import { prisma, type DbClient } from '../db';
import type { RequestMeta } from '../request';
import type { AuthContext } from './context';
import type { SessionRevokeReason } from '@/generated/prisma/client';

/**
 * Sessões da equipe, guardadas no banco. O navegador recebe um token aleatório
 * de 256 bits num cookie httpOnly; o banco guarda só o SHA-256 dele. Revogar é
 * imediato: a sessão é conferida em toda requisição.
 */

export const SESSION_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const INTERVALO_TOQUE_MS = 5 * 60 * 1000;

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export async function createSession(
  db: DbClient,
  input: { userId: string; parkId: string; meta: RequestMeta },
): Promise<CreatedSession> {
  const token = randomToken(32);
  const agora = Date.now();
  const expiresAt = new Date(agora + SESSION_ABSOLUTE_TTL_MS);
  const sessao = await db.session.create({
    data: {
      userId: input.userId,
      parkId: input.parkId,
      tokenHash: sha256Hex(token),
      ip: input.meta.ip,
      userAgent: input.meta.userAgent,
      createdAt: new Date(agora),
      lastSeenAt: new Date(agora),
      expiresAt,
    },
    select: { id: true },
  });
  return { token, sessionId: sessao.id, expiresAt };
}

/** Confere o token do cookie e monta o contexto de acesso. `null` = sem sessão válida. */
export async function resolveSession(
  token: string | undefined,
  db: DbClient = prisma,
): Promise<AuthContext | null> {
  if (!token || token.length < 32 || token.length > 128) return null;

  const sessao = await db.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: {
      id: true,
      userId: true,
      parkId: true,
      lastSeenAt: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { id: true, name: true, email: true, status: true, mustChangePassword: true } },
      park: { select: { id: true, name: true, slug: true, timezone: true, isActive: true } },
    },
  });
  if (!sessao || sessao.revokedAt) return null;

  const agora = Date.now();
  if (sessao.expiresAt.getTime() <= agora) return null;
  if (sessao.lastSeenAt.getTime() + SESSION_IDLE_TTL_MS <= agora) return null;
  if (sessao.user.status !== 'ACTIVE' || !sessao.park.isActive) return null;

  if (agora - sessao.lastSeenAt.getTime() > INTERVALO_TOQUE_MS) {
    await db.session.updateMany({
      where: { id: sessao.id, lastSeenAt: { lt: new Date(agora - INTERVALO_TOQUE_MS) } },
      data: { lastSeenAt: new Date(agora) },
    });
  }

  const acesso = await loadAccess(sessao.userId, sessao.parkId, db);
  return {
    sessionId: sessao.id,
    user: {
      id: sessao.user.id,
      name: sessao.user.name,
      email: sessao.user.email,
      mustChangePassword: sessao.user.mustChangePassword,
    },
    park: {
      id: sessao.park.id,
      name: sessao.park.name,
      slug: sessao.park.slug,
      timezone: sessao.park.timezone,
    },
    roles: acesso.roles,
    permissions: acesso.permissions,
    isSuperAdmin: acesso.isSuperAdmin,
  };
}

export async function revokeSession(
  db: DbClient,
  sessionId: string,
  reason: SessionRevokeReason,
): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** Encerra todas as sessões ativas de alguém (opcionalmente mantendo a atual). */
export async function revokeUserSessions(
  db: DbClient,
  userId: string,
  reason: SessionRevokeReason,
  options: { exceptSessionId?: string } = {},
): Promise<number> {
  const { count } = await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return count;
}
