import 'server-only';

import type { Prisma, PrismaClient, UserStatus } from '@/generated/prisma/client';
import { SUPER_ADMIN_ROLE, isRoleKey, type RoleKey } from '@/lib/access';

import { loadAccess } from '../access/service';
import { recordAudit } from '../audit';
import { requirePermission, type AuthContext } from '../auth/context';
import { hashPassword } from '../auth/password';
import { revokeUserSessions } from '../auth/session';
import { generateStrongPassword } from '../crypto';
import { prisma, type DbClient, type Tx } from '../db';
import { AppError, Errors } from '../errors';
import type { RequestMeta } from '../request';

/**
 * Equipe do parque. Regras de hierarquia valem para todas as operações:
 * - só super admin mexe em super admin (e só ele nomeia outro);
 * - ninguém atribui papel com acesso que não tem, nem altera quem tem mais acesso;
 * - ninguém altera o próprio papel ou o próprio status (evita se trancar fora);
 * - o parque nunca fica sem um super admin ativo.
 */

export const USERS_PAGE_SIZE = 20;

function selecao(parkId: string) {
  return {
    id: true,
    name: true,
    email: true,
    phone: true,
    status: true,
    mustChangePassword: true,
    lastLoginAt: true,
    createdAt: true,
    roles: { where: { parkId }, select: { role: { select: { key: true } } } },
  } satisfies Prisma.UserSelect;
}

type UsuarioSelecionado = Prisma.UserGetPayload<{ select: ReturnType<typeof selecao> }>;

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: RoleKey[];
}

function paraMembro(usuario: UsuarioSelecionado): StaffMember {
  return {
    id: usuario.id,
    name: usuario.name,
    email: usuario.email,
    phone: usuario.phone,
    status: usuario.status,
    mustChangePassword: usuario.mustChangePassword,
    lastLoginAt: usuario.lastLoginAt,
    createdAt: usuario.createdAt,
    roles: usuario.roles.map((vinculo) => vinculo.role.key).filter(isRoleKey),
  };
}

function papeisValidos(papeis: readonly string[]): RoleKey[] {
  const unicos = [...new Set(papeis)];
  const invalidos = unicos.filter((papel) => !isRoleKey(papel));
  if (invalidos.length > 0) throw Errors.badRequest('Há papéis que não existem.', { roles: invalidos });
  if (unicos.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Escolha ao menos um papel.', {
      details: { fields: { roles: 'Escolha ao menos um papel.' } },
    });
  }
  return unicos.filter(isRoleKey);
}

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && 'code' in erro && erro.code === 'P2002';
}

async function carregarAlvo(db: DbClient, auth: AuthContext, userId: string): Promise<UsuarioSelecionado> {
  const alvo = await db.user.findFirst({
    where: { id: userId, roles: { some: { parkId: auth.park.id } } },
    select: selecao(auth.park.id),
  });
  if (!alvo) throw Errors.notFound('Pessoa da equipe não encontrada.');
  return alvo;
}

async function garantirPodeAtribuir(
  db: DbClient,
  auth: AuthContext,
  papeis: readonly RoleKey[],
): Promise<void> {
  if (papeis.includes(SUPER_ADMIN_ROLE) && !auth.isSuperAdmin) {
    throw new AppError('FORBIDDEN', 'Só um super admin pode nomear outro super admin.');
  }
  if (auth.isSuperAdmin || papeis.length === 0) return;
  const concedidas = await db.rolePermission.findMany({
    where: { role: { key: { in: [...papeis] } } },
    select: { permission: { select: { key: true } } },
  });
  const minhas = auth.permissions as ReadonlySet<string>;
  const acima = [...new Set(concedidas.map((c) => c.permission.key))].filter((chave) => !minhas.has(chave));
  if (acima.length > 0) {
    throw new AppError('FORBIDDEN', 'Você não pode atribuir um papel com acessos que você não tem.', {
      details: { permissions: acima },
    });
  }
}

async function garantirHierarquia(db: DbClient, auth: AuthContext, alvo: UsuarioSelecionado): Promise<void> {
  if (alvo.id === auth.user.id) {
    throw new AppError(
      'FORBIDDEN',
      'Você não pode alterar o próprio acesso. Peça a outra pessoa da administração.',
    );
  }
  const papeisDoAlvo = alvo.roles.map((vinculo) => vinculo.role.key);
  if (papeisDoAlvo.includes(SUPER_ADMIN_ROLE) && !auth.isSuperAdmin) {
    throw new AppError('FORBIDDEN', 'Só um super admin pode alterar outro super admin.');
  }
  if (auth.isSuperAdmin) return;
  const acessoDoAlvo = await loadAccess(alvo.id, auth.park.id, db);
  const acima = [...acessoDoAlvo.permissions].filter((chave) => !auth.permissions.has(chave));
  if (acima.length > 0) {
    throw new AppError(
      'FORBIDDEN',
      'Esta pessoa tem acessos que você não tem, por isso você não pode alterá-la.',
      {
        details: { permissions: acima },
      },
    );
  }
}

/** O parque nunca fica sem super admin ativo. Precisa rodar dentro de transação (usa trava). */
export async function ensureAnotherActiveSuperAdmin(
  tx: Tx,
  parkId: string,
  exceptUserId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('super_admin_guard'), hashtext(${parkId}))`;
  const outros = await tx.userRole.count({
    where: {
      parkId,
      userId: { not: exceptUserId },
      role: { key: SUPER_ADMIN_ROLE },
      user: { status: 'ACTIVE' },
    },
  });
  if (outros === 0) {
    throw new AppError(
      'LAST_SUPER_ADMIN',
      'Esta é a única pessoa com acesso de super admin ativo neste parque. Nomeie outra antes.',
    );
  }
}

// ─── Consultas ──────────────────────────────────────────────────────────────

export interface ListUsersFilters {
  q?: string;
  status?: UserStatus;
  role?: RoleKey;
  page?: number;
}

export async function listUsers(auth: AuthContext, filters: ListUsersFilters = {}, db: DbClient = prisma) {
  requirePermission(auth, 'users.view');
  const pagina = Math.max(1, Math.floor(filters.page ?? 1));
  const busca = filters.q?.trim();
  const where: Prisma.UserWhereInput = {
    roles: { some: { parkId: auth.park.id, ...(filters.role ? { role: { key: filters.role } } : {}) } },
    ...(filters.status ? { status: filters.status } : {}),
    ...(busca
      ? {
          OR: [
            { name: { contains: busca, mode: 'insensitive' } },
            { email: { contains: busca.toLowerCase() } },
          ],
        }
      : {}),
  };
  const [total, usuarios] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: selecao(auth.park.id),
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      skip: (pagina - 1) * USERS_PAGE_SIZE,
      take: USERS_PAGE_SIZE,
    }),
  ]);
  return { items: usuarios.map(paraMembro), total, page: pagina, pageSize: USERS_PAGE_SIZE };
}

export interface StaffSession {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface StaffMemberDetail extends StaffMember {
  passwordChangedAt: Date | null;
  createdBy: { id: string; name: string } | null;
  sessions: StaffSession[];
}

export async function getUser(
  auth: AuthContext,
  userId: string,
  db: DbClient = prisma,
): Promise<StaffMemberDetail> {
  requirePermission(auth, 'users.view');
  const usuario = await db.user.findFirst({
    where: { id: userId, roles: { some: { parkId: auth.park.id } } },
    select: {
      ...selecao(auth.park.id),
      passwordChangedAt: true,
      createdBy: { select: { id: true, name: true } },
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: 'desc' },
        take: 20,
        select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ip: true, userAgent: true },
      },
    },
  });
  if (!usuario) throw Errors.notFound('Pessoa da equipe não encontrada.');
  return {
    ...paraMembro(usuario),
    passwordChangedAt: usuario.passwordChangedAt,
    createdBy: usuario.createdBy,
    sessions: usuario.sessions.map((sessao) => ({ ...sessao, current: sessao.id === auth.sessionId })),
  };
}

// ─── Alterações ─────────────────────────────────────────────────────────────

export interface CreateUserInput {
  name: string;
  email: string;
  phone: string | null;
  roles: readonly string[];
}

/** Cria a pessoa com senha temporária (mostrada uma única vez) e troca obrigatória no primeiro acesso. */
export async function createUser(
  auth: AuthContext,
  input: CreateUserInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<{ user: StaffMember; temporaryPassword: string }> {
  requirePermission(auth, 'users.manage');
  const papeis = papeisValidos(input.roles);
  const email = input.email.trim().toLowerCase();
  const temporaryPassword = generateStrongPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const usuario = await db.$transaction(async (tx) => {
      await garantirPodeAtribuir(tx, auth, papeis);
      const idsDosPapeis = await tx.role.findMany({ where: { key: { in: papeis } }, select: { id: true } });
      const criado = await tx.user.create({
        data: {
          name: input.name.trim(),
          email,
          phone: input.phone,
          passwordHash,
          mustChangePassword: true,
          createdById: auth.user.id,
          roles: {
            create: idsDosPapeis.map(({ id }) => ({
              parkId: auth.park.id,
              roleId: id,
              grantedById: auth.user.id,
            })),
          },
        },
        select: selecao(auth.park.id),
      });
      await recordAudit(tx, {
        action: 'users.created',
        parkId: auth.park.id,
        actorUserId: auth.user.id,
        entityType: 'user',
        entityId: criado.id,
        after: { name: criado.name, email: criado.email, phone: criado.phone, roles: papeis },
        meta,
      });
      return criado;
    });
    return { user: paraMembro(usuario), temporaryPassword };
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      throw Errors.conflict('Já existe uma pessoa da equipe com este e-mail.', {
        fields: { email: 'Este e-mail já está cadastrado.' },
      });
    }
    throw erro;
  }
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string | null;
}

export async function updateUser(
  auth: AuthContext,
  userId: string,
  input: UpdateUserInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<StaffMember> {
  requirePermission(auth, 'users.manage');
  try {
    const usuario = await db.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, auth, userId);
      if (alvo.id !== auth.user.id) await garantirHierarquia(tx, auth, alvo);

      const dados = {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      };
      const antes = { name: alvo.name, email: alvo.email, phone: alvo.phone };
      const mudou = Object.entries(dados).some(
        ([campo, valor]) => antes[campo as keyof typeof antes] !== valor,
      );
      if (!mudou) return alvo;

      const atualizado = await tx.user.update({
        where: { id: alvo.id },
        data: dados,
        select: selecao(auth.park.id),
      });
      await recordAudit(tx, {
        action: 'users.updated',
        parkId: auth.park.id,
        actorUserId: auth.user.id,
        entityType: 'user',
        entityId: alvo.id,
        before: antes,
        after: { name: atualizado.name, email: atualizado.email, phone: atualizado.phone },
        meta,
      });
      return atualizado;
    });
    return paraMembro(usuario);
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      throw Errors.conflict('Já existe uma pessoa da equipe com este e-mail.', {
        fields: { email: 'Este e-mail já está cadastrado.' },
      });
    }
    throw erro;
  }
}

export async function setUserRoles(
  auth: AuthContext,
  userId: string,
  roles: readonly string[],
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<StaffMember> {
  requirePermission(auth, 'users.manage');
  const papeis = papeisValidos(roles);

  const usuario = await db.$transaction(async (tx) => {
    const alvo = await carregarAlvo(tx, auth, userId);
    await garantirHierarquia(tx, auth, alvo);
    await garantirPodeAtribuir(tx, auth, papeis);

    const antes = alvo.roles
      .map((vinculo) => vinculo.role.key)
      .filter(isRoleKey)
      .sort();
    const depois = [...papeis].sort();
    if (antes.join() === depois.join()) return alvo;

    if (antes.includes(SUPER_ADMIN_ROLE) && !depois.includes(SUPER_ADMIN_ROLE)) {
      await ensureAnotherActiveSuperAdmin(tx, auth.park.id, alvo.id);
    }

    const idsDosPapeis = await tx.role.findMany({ where: { key: { in: depois } }, select: { id: true } });
    await tx.userRole.deleteMany({ where: { userId: alvo.id, parkId: auth.park.id } });
    await tx.userRole.createMany({
      data: idsDosPapeis.map(({ id }) => ({
        userId: alvo.id,
        parkId: auth.park.id,
        roleId: id,
        grantedById: auth.user.id,
      })),
    });
    await revokeUserSessions(tx, alvo.id, 'ACCESS_CHANGED');
    await recordAudit(tx, {
      action: 'users.roles_changed',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'user',
      entityId: alvo.id,
      before: { roles: antes },
      after: { roles: depois },
      meta,
    });
    return carregarAlvo(tx, auth, alvo.id);
  });
  return paraMembro(usuario);
}

export async function setUserStatus(
  auth: AuthContext,
  userId: string,
  status: UserStatus,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<StaffMember> {
  requirePermission(auth, 'users.manage');

  const usuario = await db.$transaction(async (tx) => {
    const alvo = await carregarAlvo(tx, auth, userId);
    await garantirHierarquia(tx, auth, alvo);
    if (alvo.status === status) return alvo;

    const ehSuperAdmin = alvo.roles.some((vinculo) => vinculo.role.key === SUPER_ADMIN_ROLE);
    if (status !== 'ACTIVE' && ehSuperAdmin) await ensureAnotherActiveSuperAdmin(tx, auth.park.id, alvo.id);

    const atualizado = await tx.user.update({
      where: { id: alvo.id },
      data: { status },
      select: selecao(auth.park.id),
    });
    if (status !== 'ACTIVE') await revokeUserSessions(tx, alvo.id, 'USER_DISABLED');
    await recordAudit(tx, {
      action: 'users.status_changed',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'user',
      entityId: alvo.id,
      before: { status: alvo.status },
      after: { status },
      meta,
    });
    return atualizado;
  });
  return paraMembro(usuario);
}

/** Gera nova senha temporária (mostrada uma vez), exige troca no próximo acesso e encerra as sessões. */
export async function resetUserPassword(
  auth: AuthContext,
  userId: string,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<{ temporaryPassword: string }> {
  requirePermission(auth, 'users.manage');
  const temporaryPassword = generateStrongPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await db.$transaction(async (tx) => {
    const alvo = await carregarAlvo(tx, auth, userId);
    await garantirHierarquia(tx, auth, alvo);
    await tx.user.update({
      where: { id: alvo.id },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: alvo.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await revokeUserSessions(tx, alvo.id, 'PASSWORD_RESET');
    await recordAudit(tx, {
      action: 'users.password_reset_by_admin',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'user',
      entityId: alvo.id,
      meta,
    });
  });
  return { temporaryPassword };
}

export async function revokeSessionsOfUser(
  auth: AuthContext,
  userId: string,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<{ revoked: number }> {
  requirePermission(auth, 'users.manage');
  return db.$transaction(async (tx) => {
    const alvo = await carregarAlvo(tx, auth, userId);
    await garantirHierarquia(tx, auth, alvo);
    const revoked = await revokeUserSessions(tx, alvo.id, 'ADMIN_REVOKED');
    await recordAudit(tx, {
      action: 'users.sessions_revoked',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'user',
      entityId: alvo.id,
      data: { revoked },
      meta,
    });
    return { revoked };
  });
}
