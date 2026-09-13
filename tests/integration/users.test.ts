import { describe, expect, it } from 'vitest';

import { login } from '@/server/auth/service';
import { resolveSession } from '@/server/auth/session';
import { prisma } from '@/server/db';
import {
  createUser as criarPelaAdministracao,
  ensureAnotherActiveSuperAdmin,
  getUser,
  listUsers,
  resetUserPassword,
  setUserRoles,
  setUserStatus,
  updateUser,
} from '@/server/users/service';

import {
  authAs,
  createPark,
  createUser,
  DEFAULT_PASSWORD,
  expectAppError,
  lastAudit,
  meta,
} from '../helpers/factories';

describe('cadastro da equipe', () => {
  it('administrador cria pessoa com senha temporária e troca obrigatória', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const { auth } = await authAs(admin, parque.id);

    const { user, temporaryPassword } = await criarPelaAdministracao(
      auth,
      { name: 'Joana Portaria', email: 'Joana.Portaria@Teste.dev', phone: '5573999998888', roles: ['GATE'] },
      meta(),
    );
    expect(user.email).toBe('joana.portaria@teste.dev');
    expect(user.roles).toEqual(['GATE']);
    expect(user.mustChangePassword).toBe(true);
    expect(temporaryPassword).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);

    const entrada = await login({ email: user.email, password: temporaryPassword }, meta());
    expect(entrada.mustChangePassword).toBe(true);

    const registro = await lastAudit('users.created', user.id);
    expect(registro?.actorUserId).toBe(admin.id);
    expect(JSON.stringify(registro)).not.toContain(temporaryPassword);
  });

  it('e-mail repetido dá conflito', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const existente = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const { auth } = await authAs(admin, parque.id);
    await expectAppError(
      criarPelaAdministracao(
        auth,
        { name: 'Outra Pessoa', email: existente.email, phone: null, roles: ['GATE'] },
        meta(),
      ),
      'CONFLICT',
    );
  });

  it('só super admin nomeia super admin', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const { auth } = await authAs(admin, parque.id);
    await expectAppError(
      criarPelaAdministracao(
        auth,
        { name: 'Quer Ser Dono', email: 'dono2@teste.dev', phone: null, roles: ['SUPER_ADMIN'] },
        meta(),
      ),
      'FORBIDDEN',
    );
  });

  it('quem não tem users.manage não cria; quem não tem users.view não lista', async () => {
    const parque = await createPark();
    const gerente = await createUser({ parkId: parque.id, roles: ['MANAGER'] });
    const porteiro = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const comoGerente = await authAs(gerente, parque.id);
    const comoPorteiro = await authAs(porteiro, parque.id);

    await expect(listUsers(comoGerente.auth)).resolves.toMatchObject({ page: 1 });
    await expectAppError(
      criarPelaAdministracao(
        comoGerente.auth,
        { name: 'Nova Pessoa', email: 'nova@teste.dev', phone: null, roles: ['GATE'] },
        meta(),
      ),
      'FORBIDDEN',
    );
    await expectAppError(listUsers(comoPorteiro.auth), 'FORBIDDEN');
  });

  it('lista só a equipe do parque atual, com busca', async () => {
    const parque = await createPark();
    const outro = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'], name: 'Administradora Ana' });
    await createUser({ parkId: parque.id, roles: ['GATE'], name: 'Bruno Portaria' });
    await createUser({ parkId: outro.id, roles: ['GATE'], name: 'Bruno de Outro Parque' });
    const { auth } = await authAs(admin, parque.id);

    const todos = await listUsers(auth);
    expect(todos.total).toBe(2);
    const busca = await listUsers(auth, { q: 'bruno' });
    expect(busca.items.map((pessoa) => pessoa.name)).toEqual(['Bruno Portaria']);
  });
});

describe('alterações de acesso', () => {
  it('troca de papel encerra as sessões da pessoa e vai para a auditoria', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const { auth } = await authAs(admin, parque.id);
    const sessaoDaPessoa = await authAs(pessoa, parque.id);

    const atualizada = await setUserRoles(auth, pessoa.id, ['SUPPORT', 'BOX_OFFICE'], meta());
    expect(atualizada.roles.sort()).toEqual(['BOX_OFFICE', 'SUPPORT']);
    expect(await resolveSession(sessaoDaPessoa.token)).toBeNull();

    const registro = await lastAudit('users.roles_changed', pessoa.id);
    expect(registro?.before).toEqual({ roles: ['GATE'] });
    expect(registro?.after).toEqual({ roles: ['BOX_OFFICE', 'SUPPORT'] });
  });

  it('ninguém altera o próprio acesso', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const { auth } = await authAs(admin, parque.id);
    await expectAppError(setUserRoles(auth, admin.id, ['READ_ONLY'], meta()), 'FORBIDDEN');
    await expectAppError(setUserStatus(auth, admin.id, 'DISABLED', meta()), 'FORBIDDEN');
  });

  it('administrador não mexe em super admin', async () => {
    const parque = await createPark();
    const dono = await createUser({ parkId: parque.id, roles: ['SUPER_ADMIN'] });
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const { auth } = await authAs(admin, parque.id);

    await expectAppError(setUserRoles(auth, dono.id, ['ADMIN'], meta()), 'FORBIDDEN');
    await expectAppError(setUserStatus(auth, dono.id, 'DISABLED', meta()), 'FORBIDDEN');
    await expectAppError(updateUser(auth, dono.id, { email: 'tomado@teste.dev' }, meta()), 'FORBIDDEN');
    await expectAppError(resetUserPassword(auth, dono.id, meta()), 'FORBIDDEN');
  });

  it('desativar encerra as sessões na hora', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const pessoa = await createUser({ parkId: parque.id, roles: ['BOX_OFFICE'] });
    const { auth } = await authAs(admin, parque.id);
    const sessao = await authAs(pessoa, parque.id);

    const desativada = await setUserStatus(auth, pessoa.id, 'DISABLED', meta());
    expect(desativada.status).toBe('DISABLED');
    expect(await resolveSession(sessao.token)).toBeNull();
    expect((await lastAudit('users.status_changed', pessoa.id))?.after).toEqual({ status: 'DISABLED' });
  });

  it('o parque nunca fica sem super admin ativo', async () => {
    const parque = await createPark();
    const unico = await createUser({ parkId: parque.id, roles: ['SUPER_ADMIN'] });
    await expectAppError(
      prisma.$transaction((tx) => ensureAnotherActiveSuperAdmin(tx, parque.id, unico.id)),
      'LAST_SUPER_ADMIN',
    );

    const segundo = await createUser({ parkId: parque.id, roles: ['SUPER_ADMIN'] });
    await expect(
      prisma.$transaction((tx) => ensureAnotherActiveSuperAdmin(tx, parque.id, unico.id)),
    ).resolves.toBeUndefined();

    const { auth } = await authAs(segundo, parque.id);
    await setUserStatus(auth, unico.id, 'DISABLED', meta());
    await expectAppError(
      prisma.$transaction((tx) => ensureAnotherActiveSuperAdmin(tx, parque.id, segundo.id)),
      'LAST_SUPER_ADMIN',
    );
  });

  it('redefinição pela administração gera senha temporária e derruba a antiga', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const pessoa = await createUser({ parkId: parque.id, roles: ['FINANCE'] });
    const { auth } = await authAs(admin, parque.id);

    const { temporaryPassword } = await resetUserPassword(auth, pessoa.id, meta());
    await expectAppError(
      login({ email: pessoa.email, password: DEFAULT_PASSWORD }, meta()),
      'INVALID_CREDENTIALS',
    );
    const entrada = await login({ email: pessoa.email, password: temporaryPassword }, meta());
    expect(entrada.mustChangePassword).toBe(true);
  });

  it('edição de dados registra antes e depois', async () => {
    const parque = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const pessoa = await createUser({ parkId: parque.id, roles: ['SUPPORT'], name: 'Carla Atendimento' });
    const { auth } = await authAs(admin, parque.id);

    await updateUser(auth, pessoa.id, { name: 'Carla Souza', phone: '5573988887777' }, meta());
    const detalhe = await getUser(auth, pessoa.id);
    expect(detalhe.name).toBe('Carla Souza');
    expect(detalhe.phone).toBe('5573988887777');

    const registro = await lastAudit('users.updated', pessoa.id);
    expect(registro?.before).toMatchObject({ name: 'Carla Atendimento', phone: null });
    expect(registro?.after).toMatchObject({ name: 'Carla Souza', phone: '5573988887777' });
  });

  it('pessoa de outro parque não é encontrada', async () => {
    const parque = await createPark();
    const outro = await createPark();
    const admin = await createUser({ parkId: parque.id, roles: ['ADMIN'] });
    const deFora = await createUser({ parkId: outro.id, roles: ['GATE'] });
    const { auth } = await authAs(admin, parque.id);
    await expectAppError(getUser(auth, deFora.id), 'NOT_FOUND');
    await expectAppError(setUserStatus(auth, deFora.id, 'DISABLED', meta()), 'NOT_FOUND');
  });
});
