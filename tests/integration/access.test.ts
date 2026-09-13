import { beforeAll, describe, expect, it } from 'vitest';

import { ALL_PERMISSIONS, defaultPermissionsFor, ROLE_KEYS } from '@/lib/access';
import { listRoles, loadAccess, setRolePermissions, syncAccessCatalog } from '@/server/access/service';
import { prisma } from '@/server/db';

import {
  authAs,
  createPark,
  createUser,
  ensureCatalog,
  expectAppError,
  lastAudit,
  meta,
} from '../helpers/factories';

async function permissoesNoBanco(roleKey: string): Promise<string[]> {
  const linhas = await prisma.rolePermission.findMany({
    where: { role: { key: roleKey } },
    select: { permission: { select: { key: true } } },
  });
  return linhas.map((linha) => linha.permission.key).sort();
}

describe('sincronização do catálogo', () => {
  beforeAll(async () => {
    await ensureCatalog();
  });

  it('grava todos os papéis e as permissões padrão de cada um', async () => {
    expect(await prisma.permission.count()).toBe(ALL_PERMISSIONS.length);
    for (const papel of ROLE_KEYS) {
      expect(await permissoesNoBanco(papel)).toEqual([...defaultPermissionsFor(papel)].sort());
    }
  });

  it('é idempotente', async () => {
    const segunda = await syncAccessCatalog();
    expect(segunda).toEqual({
      permissionsCreated: [],
      permissionsRemoved: [],
      rolesCreated: [],
      grantsAdded: 0,
    });
  });

  it('preserva ajustes feitos pelo painel', async () => {
    await prisma.rolePermission.deleteMany({
      where: { role: { key: 'MANAGER' }, permission: { key: 'orders.export' } },
    });
    await syncAccessCatalog();
    expect(await permissoesNoBanco('MANAGER')).not.toContain('orders.export');

    const gerente = await prisma.role.findUniqueOrThrow({ where: { key: 'MANAGER' } });
    const permissao = await prisma.permission.findUniqueOrThrow({ where: { key: 'orders.export' } });
    await prisma.rolePermission.create({ data: { roleId: gerente.id, permissionId: permissao.id } });
  });
});

describe('permissões efetivas', () => {
  it('portaria só enxerga o check-in; super admin tem tudo; sem vínculo, nada', async () => {
    const parque = await createPark();
    const outroParque = await createPark();
    const porteiro = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const dono = await createUser({ parkId: parque.id, roles: ['SUPER_ADMIN'] });

    expect([...(await loadAccess(porteiro.id, parque.id)).permissions].sort()).toEqual([
      'checkin.manual',
      'checkin.scan',
    ]);

    const acessoDono = await loadAccess(dono.id, parque.id);
    expect(acessoDono.isSuperAdmin).toBe(true);
    expect(acessoDono.permissions.size).toBe(ALL_PERMISSIONS.length);

    const semVinculo = await loadAccess(porteiro.id, outroParque.id);
    expect(semVinculo.roles).toEqual([]);
    expect(semVinculo.permissions.size).toBe(0);
  });

  it('soma as permissões de mais de um papel', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE', 'BOX_OFFICE'] });
    const acesso = await loadAccess(pessoa.id, parque.id);
    expect(acesso.permissions.has('checkin.scan')).toBe(true);
    expect(acesso.permissions.has('pos.sell')).toBe(true);
    expect(acesso.permissions.has('refunds.approve')).toBe(false);
  });
});

describe('edição da matriz de permissões', () => {
  it('administrador altera um papel e a mudança vai para a auditoria', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const { auth } = await authAs(admin, parque.id);
    const antes = await permissoesNoBanco('SUPPORT');

    try {
      const atualizado = await setRolePermissions(
        auth,
        { roleKey: 'SUPPORT', permissions: [...antes, 'reports.view'] },
        meta(),
      );
      expect(atualizado.permissions).toContain('reports.view');

      const registro = await lastAudit('roles.permissions_changed', 'SUPPORT');
      expect(registro?.actorUserId).toBe(admin.id);
      expect(registro?.data).toMatchObject({ added: ['reports.view'], removed: [] });
    } finally {
      await setRolePermissions(auth, { roleKey: 'SUPPORT', permissions: antes }, meta());
    }
    expect(await permissoesNoBanco('SUPPORT')).toEqual(antes);
  });

  it('super admin não é editável', async () => {
    const parque = await createPark();
    const dono = await createUser({ parkId: parque.id, roles: ['SUPER_ADMIN'] });
    const { auth } = await authAs(dono, parque.id);
    await expectAppError(
      setRolePermissions(auth, { roleKey: 'SUPER_ADMIN', permissions: [] }, meta()),
      'FORBIDDEN',
    );
  });

  it('quem não tem roles.manage recebe 403', async () => {
    const parque = await createPark();
    const gerente = await createUser({ parkId: parque.id, roles: ['MANAGER'] });
    const { auth } = await authAs(gerente, parque.id);
    await expectAppError(
      setRolePermissions(auth, { roleKey: 'GATE', permissions: ['checkin.scan'] }, meta()),
      'FORBIDDEN',
    );
  });

  it('recusa permissão inexistente', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const { auth } = await authAs(admin, parque.id);
    await expectAppError(
      setRolePermissions(auth, { roleKey: 'GATE', permissions: ['checkin.scan', 'tudo.liberado'] }, meta()),
      'BAD_REQUEST',
    );
  });

  it('lista papéis com membros ativos do parque', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    await createUser({ parkId: parque.id, roles: ['GATE'] });
    await createUser({ parkId: parque.id, roles: ['GATE'], status: 'DISABLED' });
    const { auth } = await authAs(admin, parque.id);
    const papeis = await listRoles(auth);
    expect(papeis.find((papel) => papel.key === 'GATE')?.members).toBe(1);
    expect(papeis.find((papel) => papel.key === 'SUPER_ADMIN')?.editable).toBe(false);
  });
});
