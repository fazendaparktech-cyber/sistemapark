import 'server-only';

import type { AuditActorType, Prisma } from '@/generated/prisma/client';

import { requirePermission, type AuthContext } from './auth/context';
import { prisma, type DbClient } from './db';
import type { RequestMeta } from './request';

/**
 * Trilha de auditoria: quem fez o quê, em qual registro, quando, de onde, com o
 * antes e o depois. A tabela é somente-inclusão (trigger no banco).
 *
 * Grave dentro da mesma transação da alteração: se a alteração desfizer, o
 * registro some junto; se o registro falhar, a alteração não acontece.
 */

const CAMPOS_SENSIVEIS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'temporaryPassword',
  'token',
  'tokenHash',
  'cpf',
]);

function paraJson(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined || valor === null) return undefined;
  const texto = JSON.stringify(valor, (chave, v: unknown) =>
    CAMPOS_SENSIVEIS.has(chave) ? '[removido]' : v,
  );
  if (texto === undefined) return undefined;
  const json: unknown = JSON.parse(texto);
  return json === null ? undefined : (json as Prisma.InputJsonValue);
}

export interface AuditInput {
  action: string;
  parkId?: string | null;
  actorType?: AuditActorType;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  data?: unknown;
  meta?: RequestMeta;
}

export async function recordAudit(db: DbClient, input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      action: input.action,
      parkId: input.parkId ?? null,
      actorType: input.actorType ?? (input.actorUserId ? 'USER' : 'SYSTEM'),
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      before: paraJson(input.before),
      after: paraJson(input.after),
      data: paraJson(input.data),
      ip: input.meta?.ip ?? null,
      userAgent: input.meta?.userAgent ?? null,
      requestId: input.meta?.requestId ?? null,
    },
  });
}

// ─── Consulta ───────────────────────────────────────────────────────────────

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface AuditLogItem {
  id: string;
  createdAt: Date;
  action: string;
  actorType: AuditActorType;
  actor: { id: string; name: string; email: string } | null;
  entityType: string | null;
  entityId: string | null;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  data: Prisma.JsonValue | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

interface Cursor {
  t: string;
  id: string;
}

function lerCursor(valor: string | undefined): { createdAt: Date; id: string } | null {
  if (!valor) return null;
  try {
    const cursor = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof cursor.t !== 'string' || typeof cursor.id !== 'string') return null;
    const createdAt = new Date(cursor.t);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: cursor.id };
  } catch {
    return null;
  }
}

function escreverCursor(item: { createdAt: Date; id: string }): string {
  const cursor: Cursor = { t: item.createdAt.toISOString(), id: item.id };
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Lista paginada por cursor (mais recentes primeiro), só do parque atual. */
export async function listAuditLogs(
  auth: AuthContext,
  filters: AuditLogFilters = {},
  db: DbClient = prisma,
): Promise<{ items: AuditLogItem[]; nextCursor: string | null }> {
  requirePermission(auth, 'audit.view');
  const limite = Math.min(Math.max(Math.floor(filters.limit ?? 50), 1), 100);
  const cursor = lerCursor(filters.cursor);

  const condicoes: Prisma.AuditLogWhereInput[] = [
    // Eventos sem parque (ex.: login com e-mail inexistente) só aparecem para super admin.
    auth.isSuperAdmin ? { OR: [{ parkId: auth.park.id }, { parkId: null }] } : { parkId: auth.park.id },
  ];
  if (filters.action) condicoes.push({ action: { startsWith: filters.action } });
  if (filters.entityType) condicoes.push({ entityType: filters.entityType });
  if (filters.entityId) condicoes.push({ entityId: filters.entityId });
  if (filters.actorUserId) condicoes.push({ actorUserId: filters.actorUserId });
  if (filters.from) condicoes.push({ createdAt: { gte: filters.from } });
  if (filters.to) condicoes.push({ createdAt: { lt: filters.to } });
  if (cursor) {
    condicoes.push({
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
    });
  }

  const linhas = await db.auditLog.findMany({
    where: { AND: condicoes },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limite + 1,
    select: {
      id: true,
      createdAt: true,
      action: true,
      actorType: true,
      actorUser: { select: { id: true, name: true, email: true } },
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      data: true,
      ip: true,
      userAgent: true,
      requestId: true,
    },
  });

  const pagina = linhas.slice(0, limite);
  const ultima = pagina.at(-1);
  return {
    items: pagina.map(({ actorUser, ...linha }) => ({ ...linha, actor: actorUser })),
    nextCursor: linhas.length > limite && ultima ? escreverCursor(ultima) : null,
  };
}
