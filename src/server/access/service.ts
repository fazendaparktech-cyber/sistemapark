import 'server-only';

import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_MODULE,
  ROLE_DEFINITIONS,
  SUPER_ADMIN_ROLE,
  defaultPermissionsFor,
  isPermissionKey,
  isRoleKey,
  type PermissionKey,
  type RoleKey,
} from '@/lib/access';
import type { PrismaClient } from '@/generated/prisma/client';

import { recordAudit } from '../audit';
import type { AuthContext } from '../auth/context';
import { requirePermission } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { AppError, Errors } from '../errors';
import type { RequestMeta } from '../request';

// ─── Sincronização do catálogo ──────────────────────────────────────────────

export interface AccessSyncSummary {
  permissionsCreated: PermissionKey[];
  permissionsRemoved: string[];
  rolesCreated: RoleKey[];
  grantsAdded: number;
}

/**
 * Leva o catálogo do código (`src/lib/access.ts`) para o banco. Idempotente.
 *
 * - Permissão nova entra nos papéis cujo padrão a inclui.
 * - Papel novo nasce com as permissões padrão.
 * - Ajustes feitos pelo painel em permissões já existentes são preservados.
 * - Super admin sempre fica com tudo.
 */
export async function syncAccessCatalog(db: PrismaClient = prisma): Promise<AccessSyncSummary> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('access_catalog_sync'))`;

    const permissoesAntes = await tx.permission.findMany({ select: { id: true, key: true } });
    const chavesAntes = new Set(permissoesAntes.map((p) => p.key));
    const criadas = ALL_PERMISSIONS.filter((chave) => !chavesAntes.has(chave));
    const removidas = permissoesAntes.filter((p) => !isPermissionKey(p.key));

    if (removidas.length > 0) {
      await tx.permission.deleteMany({ where: { id: { in: removidas.map((p) => p.id) } } });
    }
    for (const chave of ALL_PERMISSIONS) {
      await tx.permission.upsert({
        where: { key: chave },
        create: { key: chave, module: PERMISSION_MODULE[chave], description: PERMISSION_LABELS[chave] },
        update: { module: PERMISSION_MODULE[chave], description: PERMISSION_LABELS[chave] },
      });
    }

    const papeisAntes = new Set((await tx.role.findMany({ select: { key: true } })).map((r) => r.key));
    const papeisCriados: RoleKey[] = [];
    for (const [ordem, definicao] of ROLE_DEFINITIONS.entries()) {
      if (!papeisAntes.has(definicao.key)) papeisCriados.push(definicao.key);
      const dados = {
        name: definicao.name,
        description: definicao.description,
        isSystem: true,
        sortOrder: ordem,
      };
      await tx.role.upsert({
        where: { key: definicao.key },
        create: { key: definicao.key, ...dados },
        update: dados,
      });
    }

    const idDaPermissao = new Map(
      (await tx.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]),
    );
    let grantsAdded = 0;
    for (const papel of await tx.role.findMany({ select: { id: true, key: true } })) {
      if (!isRoleKey(papel.key)) continue;
      const padrao = defaultPermissionsFor(papel.key);
      const conceder =
        papel.key === SUPER_ADMIN_ROLE
          ? ALL_PERMISSIONS
          : papeisCriados.includes(papel.key)
            ? padrao
            : padrao.filter((chave) => criadas.includes(chave));
      const linhas = conceder.flatMap((chave) => {
        const permissionId = idDaPermissao.get(chave);
        return permissionId ? [{ roleId: papel.id, permissionId }] : [];
      });
      if (linhas.length === 0) continue;
      const { count } = await tx.rolePermission.createMany({ data: linhas, skipDuplicates: true });
      grantsAdded += count;
    }

    return {
      permissionsCreated: criadas,
      permissionsRemoved: removidas.map((p) => p.key),
      rolesCreated: papeisCriados,
      grantsAdded,
    };
  });
}

// ─── Permissões efetivas ────────────────────────────────────────────────────

export interface AccessSnapshot {
  roles: RoleKey[];
  permissions: ReadonlySet<PermissionKey>;
  isSuperAdmin: boolean;
}

/** Papéis e permissões de uma pessoa num parque, lidos do banco a cada requisição. */
export async function loadAccess(
  userId: string,
  parkId: string,
  db: DbClient = prisma,
): Promise<AccessSnapshot> {
  const vinculos = await db.userRole.findMany({
    where: { userId, parkId },
    select: {
      role: {
        select: { key: true, permissions: { select: { permission: { select: { key: true } } } } },
      },
    },
  });

  const roles = vinculos.map((v) => v.role.key).filter(isRoleKey);
  const isSuperAdmin = roles.includes(SUPER_ADMIN_ROLE);
  const permissions = new Set<PermissionKey>();
  if (isSuperAdmin) {
    for (const chave of ALL_PERMISSIONS) permissions.add(chave);
  } else {
    for (const vinculo of vinculos) {
      for (const { permission } of vinculo.role.permissions) {
        if (isPermissionKey(permission.key)) permissions.add(permission.key);
      }
    }
  }
  return { roles, permissions, isSuperAdmin };
}

// ─── Matriz de permissões (painel) ──────────────────────────────────────────

export interface RoleWithPermissions {
  key: RoleKey;
  name: string;
  description: string | null;
  editable: boolean;
  permissions: PermissionKey[];
  members: number;
}

export async function listRoles(auth: AuthContext, db: DbClient = prisma): Promise<RoleWithPermissions[]> {
  requirePermission(auth, 'users.view');
  const papeis = await db.role.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      key: true,
      name: true,
      description: true,
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { userRoles: { where: { parkId: auth.park.id, user: { status: 'ACTIVE' } } } } },
    },
  });
  return papeis.flatMap((papel) => {
    if (!isRoleKey(papel.key)) return [];
    return [
      {
        key: papel.key,
        name: papel.name,
        description: papel.description,
        editable: papel.key !== SUPER_ADMIN_ROLE,
        permissions:
          papel.key === SUPER_ADMIN_ROLE
            ? [...ALL_PERMISSIONS]
            : papel.permissions.map((rp) => rp.permission.key).filter(isPermissionKey),
        members: papel._count.userRoles,
      },
    ];
  });
}

/** Substitui as permissões de um papel. Registra antes e depois na auditoria. */
export async function setRolePermissions(
  auth: AuthContext,
  input: { roleKey: string; permissions: readonly string[] },
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<RoleWithPermissions> {
  requirePermission(auth, 'roles.manage');
  if (!isRoleKey(input.roleKey)) throw Errors.notFound('Papel não encontrado.');
  if (input.roleKey === SUPER_ADMIN_ROLE) {
    throw new AppError('FORBIDDEN', 'O papel Super admin sempre tem acesso total e não pode ser editado.');
  }

  const desconhecidas = input.permissions.filter((chave) => !isPermissionKey(chave));
  if (desconhecidas.length > 0) {
    throw Errors.badRequest('Há permissões que não existem.', { permissions: desconhecidas });
  }
  const novas = [...new Set(input.permissions.filter(isPermissionKey))].sort();
  const semDireito = novas.filter((chave) => !auth.permissions.has(chave));
  if (semDireito.length > 0) {
    throw new AppError('FORBIDDEN', 'Você não pode conceder permissões que você mesmo não tem.', {
      details: { permissions: semDireito },
    });
  }

  const roleKey = input.roleKey;
  await db.$transaction(async (tx) => {
    const papel = await tx.role.findUnique({
      where: { key: roleKey },
      select: { id: true, permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!papel) throw Errors.notFound('Papel não encontrado.');

    const antes = papel.permissions.map((rp) => rp.permission.key).sort();
    const adicionar = novas.filter((chave) => !antes.includes(chave));
    const remover = antes.filter((chave) => !(novas as string[]).includes(chave));
    if (adicionar.length === 0 && remover.length === 0) return;

    if (remover.length > 0) {
      await tx.rolePermission.deleteMany({
        where: { roleId: papel.id, permission: { key: { in: remover } } },
      });
    }
    if (adicionar.length > 0) {
      const ids = await tx.permission.findMany({ where: { key: { in: adicionar } }, select: { id: true } });
      await tx.rolePermission.createMany({
        data: ids.map(({ id }) => ({ roleId: papel.id, permissionId: id, grantedById: auth.user.id })),
        skipDuplicates: true,
      });
    }

    await recordAudit(tx, {
      action: 'roles.permissions_changed',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'role',
      entityId: roleKey,
      before: { permissions: antes },
      after: { permissions: novas },
      data: { added: adicionar, removed: remover },
      meta,
    });
  });

  const atualizado = (await listRoles(auth, db)).find((papel) => papel.key === roleKey);
  if (!atualizado) throw Errors.notFound('Papel não encontrado.');
  return atualizado;
}
