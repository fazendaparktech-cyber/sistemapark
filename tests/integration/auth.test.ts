import { hash } from '@node-rs/argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  changePassword,
  LOGIN_LIMITS,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
} from '@/server/auth/service';
import { resolveSession, SESSION_IDLE_TTL_MS } from '@/server/auth/session';
import { sha256Hex } from '@/server/crypto';
import { prisma } from '@/server/db';
import { setEmailProviderForTesting } from '@/server/integrations/email';
import { MockEmailProvider } from '@/server/integrations/email/mock';

import {
  authAs,
  createPark,
  createUser,
  DEFAULT_PASSWORD,
  expectAppError,
  lastAudit,
  meta,
} from '../helpers/factories';

const NOVA_SENHA = 'Toboagua-Laranja-Sol-88';

let correio: MockEmailProvider;

beforeAll(() => {
  correio = new MockEmailProvider();
  setEmailProviderForTesting(correio);
});

afterAll(() => {
  setEmailProviderForTesting(undefined);
});

describe('login', () => {
  it('abre sessão, registra o último acesso e audita', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['MANAGER'] });

    const resultado = await login(
      { email: `  ${pessoa.email.toUpperCase()} `, password: DEFAULT_PASSWORD },
      meta(),
    );
    const auth = await resolveSession(resultado.token);
    expect(auth?.user.id).toBe(pessoa.id);
    expect(auth?.park.id).toBe(parque.id);
    expect(auth?.permissions.has('orders.view')).toBe(true);

    const noBanco = await prisma.session.findUniqueOrThrow({ where: { id: resultado.sessionId } });
    expect(noBanco.tokenHash).toBe(sha256Hex(resultado.token));
    expect(noBanco.tokenHash).not.toContain(resultado.token);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: pessoa.id } })).lastLoginAt).not.toBeNull();
    expect((await lastAudit('auth.login', resultado.sessionId))?.actorUserId).toBe(pessoa.id);
  });

  it('senha errada e e-mail inexistente dão a mesma resposta', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });

    const senhaErrada = await expectAppError(
      login({ email: pessoa.email, password: 'nao-e-essa' }, meta()),
      'INVALID_CREDENTIALS',
    );
    const semConta = await expectAppError(
      login({ email: 'ninguem@teste.dev', password: DEFAULT_PASSWORD }, meta()),
      'INVALID_CREDENTIALS',
    );
    expect(senhaErrada.message).toBe(semConta.message);
    expect((await lastAudit('auth.login_failed', pessoa.id))?.data).toMatchObject({
      reason: 'WRONG_PASSWORD',
    });
  });

  it('bloqueia a sexta tentativa do mesmo e-mail e IP, mesmo com a senha certa', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const origem = meta();

    for (let i = 0; i < LOGIN_LIMITS.perEmailAndIp.limit; i++) {
      await expectAppError(
        login({ email: pessoa.email, password: `errada-${i}` }, origem),
        'INVALID_CREDENTIALS',
      );
    }
    await expectAppError(login({ email: pessoa.email, password: DEFAULT_PASSWORD }, origem), 'RATE_LIMITED');

    // De outro IP a pessoa ainda entra.
    const deOutroLugar = await login({ email: pessoa.email, password: DEFAULT_PASSWORD }, meta());
    expect(deOutroLugar.token).toBeTruthy();
  });

  it('login certo zera as tentativas daquele e-mail e IP', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const origem = meta();
    for (let i = 0; i < LOGIN_LIMITS.perEmailAndIp.limit - 1; i++) {
      await expectAppError(
        login({ email: pessoa.email, password: `errada-${i}` }, origem),
        'INVALID_CREDENTIALS',
      );
    }
    await login({ email: pessoa.email, password: DEFAULT_PASSWORD }, origem);
    await expectAppError(
      login({ email: pessoa.email, password: 'errada-de-novo' }, origem),
      'INVALID_CREDENTIALS',
    );
    await expectAppError(
      login({ email: pessoa.email, password: 'errada-outra' }, origem),
      'INVALID_CREDENTIALS',
    );
  });

  it('conta desativada não entra, e o motivo só aparece com a senha certa', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'], status: 'DISABLED' });
    await expectAppError(
      login({ email: pessoa.email, password: 'errada-123' }, meta()),
      'INVALID_CREDENTIALS',
    );
    await expectAppError(
      login({ email: pessoa.email, password: DEFAULT_PASSWORD }, meta()),
      'ACCOUNT_DISABLED',
    );
  });

  it('pessoa sem vínculo com parque não entra', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: [] });
    await expectAppError(
      login({ email: pessoa.email, password: DEFAULT_PASSWORD }, meta()),
      'ACCOUNT_WITHOUT_ACCESS',
    );
  });

  it('refaz o hash de senha gravado com parâmetros antigos', async () => {
    const parque = await createPark();
    const antigo = await hash(DEFAULT_PASSWORD, { memoryCost: 4096, timeCost: 1, parallelism: 1 });
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'], passwordHash: antigo });

    await login({ email: pessoa.email, password: DEFAULT_PASSWORD }, meta());
    const atualizado = await prisma.user.findUniqueOrThrow({ where: { id: pessoa.id } });
    expect(atualizado.passwordHash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
  });
});

describe('sessão', () => {
  it('logout encerra a sessão', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const { auth, token } = await authAs(pessoa, parque.id);

    await logout(auth, meta());
    expect(await resolveSession(token)).toBeNull();
    expect((await prisma.session.findUniqueOrThrow({ where: { id: auth.sessionId } })).revokedReason).toBe(
      'LOGOUT',
    );
  });

  it('expira por inatividade e pelo prazo absoluto', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });

    const inativa = await authAs(pessoa, parque.id);
    await prisma.session.update({
      where: { id: inativa.auth.sessionId },
      data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_TTL_MS - 60_000) },
    });
    expect(await resolveSession(inativa.token)).toBeNull();

    const vencida = await authAs(pessoa, parque.id);
    await prisma.session.update({
      where: { id: vencida.auth.sessionId },
      data: { createdAt: new Date(Date.now() - 13 * 3_600_000), expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await resolveSession(vencida.token)).toBeNull();
  });

  it('sessão de quem foi desativado para de valer na hora', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const { token } = await authAs(pessoa, parque.id);
    await prisma.user.update({ where: { id: pessoa.id }, data: { status: 'SUSPENDED' } });
    expect(await resolveSession(token)).toBeNull();
  });

  it('token adulterado não vale', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const { token } = await authAs(pessoa, parque.id);
    const adulterado = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(await resolveSession(adulterado)).toBeNull();
    expect(await resolveSession('')).toBeNull();
    expect(await resolveSession(undefined)).toBeNull();
  });
});

describe('redefinição de senha por e-mail', () => {
  function tokenDoEmail(texto: string): string {
    const url = texto.match(/https?:\/\/\S+/)?.[0];
    const token = url ? new URL(url).searchParams.get('token') : null;
    if (!token) throw new Error('O e-mail não trouxe o link.');
    return token;
  }

  it('troca a senha, invalida o link e encerra as sessões', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['FINANCE'], mustChangePassword: true });
    const sessaoAntiga = await authAs(pessoa, parque.id);

    const entrega = await requestPasswordReset({ email: pessoa.email }, meta());
    expect(entrega).not.toBeNull();
    await entrega?.();

    const mensagem = correio.lastTo(pessoa.email);
    expect(mensagem?.subject).toContain('Redefinição de senha');
    const token = tokenDoEmail(mensagem?.text ?? '');
    expect(mensagem?.html).toContain('/redefinir-senha?token=');

    await resetPassword({ token, password: NOVA_SENHA }, meta());

    expect(await resolveSession(sessaoAntiga.token)).toBeNull();
    await expectAppError(
      login({ email: pessoa.email, password: DEFAULT_PASSWORD }, meta()),
      'INVALID_CREDENTIALS',
    );
    const novoLogin = await login({ email: pessoa.email, password: NOVA_SENHA }, meta());
    expect(novoLogin.mustChangePassword).toBe(false);

    await expectAppError(
      resetPassword({ token, password: 'Outra-Senha-Do-Parque-5' }, meta()),
      'INVALID_RESET_TOKEN',
    );
    expect(await lastAudit('auth.password_reset', pessoa.id)).not.toBeNull();
  });

  it('e-mail inexistente não gera envio nem erro', async () => {
    const antes = correio.outbox.length;
    expect(await requestPasswordReset({ email: 'nao-existe@teste.dev' }, meta())).toBeNull();
    expect(correio.outbox.length).toBe(antes);
  });

  it('pedir de novo invalida o link anterior', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });

    await (
      await requestPasswordReset({ email: pessoa.email }, meta())
    )?.();
    const primeiro = tokenDoEmail(correio.lastTo(pessoa.email)?.text ?? '');
    await (
      await requestPasswordReset({ email: pessoa.email }, meta())
    )?.();
    const segundo = tokenDoEmail(correio.lastTo(pessoa.email)?.text ?? '');

    await expectAppError(
      resetPassword({ token: primeiro, password: NOVA_SENHA }, meta()),
      'INVALID_RESET_TOKEN',
    );
    await resetPassword({ token: segundo, password: NOVA_SENHA }, meta());
  });

  it('link vencido não vale e senha fraca é recusada', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['GATE'] });
    const token = 'token-de-teste-com-mais-de-trinta-e-dois-caracteres';
    await prisma.passwordResetToken.create({
      data: {
        userId: pessoa.id,
        tokenHash: sha256Hex(token),
        createdAt: new Date(Date.now() - 2 * 3_600_000),
        expiresAt: new Date(Date.now() - 3_600_000),
      },
    });
    await expectAppError(resetPassword({ token, password: NOVA_SENHA }, meta()), 'INVALID_RESET_TOKEN');

    await (
      await requestPasswordReset({ email: pessoa.email }, meta())
    )?.();
    const valido = tokenDoEmail(correio.lastTo(pessoa.email)?.text ?? '');
    const fraca = await expectAppError(
      resetPassword({ token: valido, password: '1234567890' }, meta()),
      'WEAK_PASSWORD',
    );
    expect(fraca.details.problems).toContain('COMMON');
  });
});

describe('troca de senha pela própria pessoa', () => {
  it('confere a senha atual, mantém a sessão atual e encerra as outras', async () => {
    const parque = await createPark();
    const pessoa = await createUser({ parkId: parque.id, roles: ['SUPPORT'], mustChangePassword: true });
    const atual = await authAs(pessoa, parque.id);
    const outra = await authAs(pessoa, parque.id);

    await expectAppError(
      changePassword(atual.auth, { currentPassword: 'nao-e-essa', newPassword: NOVA_SENHA }, meta()),
      'VALIDATION_ERROR',
    );
    await expectAppError(
      changePassword(
        atual.auth,
        { currentPassword: DEFAULT_PASSWORD, newPassword: DEFAULT_PASSWORD },
        meta(),
      ),
      'WEAK_PASSWORD',
    );
    await expectAppError(
      changePassword(atual.auth, { currentPassword: DEFAULT_PASSWORD, newPassword: 'curta' }, meta()),
      'WEAK_PASSWORD',
    );

    await changePassword(atual.auth, { currentPassword: DEFAULT_PASSWORD, newPassword: NOVA_SENHA }, meta());

    expect(await resolveSession(atual.token)).not.toBeNull();
    expect(await resolveSession(outra.token)).toBeNull();
    const atualizado = await prisma.user.findUniqueOrThrow({ where: { id: pessoa.id } });
    expect(atualizado.mustChangePassword).toBe(false);
    expect(atualizado.passwordChangedAt).not.toBeNull();
  });
});
