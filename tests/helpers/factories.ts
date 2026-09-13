import { randomUUID } from 'node:crypto';

import { expect } from 'vitest';

import type { UserStatus } from '@/generated/prisma/client';
import type { RoleKey } from '@/lib/access';
import { syncAccessCatalog } from '@/server/access/service';
import type { AuthContext } from '@/server/auth/context';
import { hashPassword } from '@/server/auth/password';
import { createSession, resolveSession } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { AppError, type ErrorCode } from '@/server/errors';
import type { RequestMeta } from '@/server/request';

/** Senha válida pela política, usada nas pessoas criadas pelos testes. */
export const DEFAULT_PASSWORD = 'Piscina-Azul-Ubata-42';

let contadorIp = 0;

/** IP único por chamada, para os limites de tentativa de um teste não afetarem outro. */
export function uniqueIp(): string {
  contadorIp += 1;
  return `198.51.${Math.floor(contadorIp / 250)}.${(contadorIp % 250) + 1}`;
}

export function meta(overrides: Partial<RequestMeta> = {}): RequestMeta {
  return { ip: uniqueIp(), userAgent: 'vitest', requestId: randomUUID(), ...overrides };
}

let catalogoPronto: Promise<unknown> | undefined;

export function ensureCatalog(): Promise<unknown> {
  catalogoPronto ??= syncAccessCatalog();
  return catalogoPronto;
}

export async function createPark(overrides: { name?: string; timezone?: string } = {}) {
  const sufixo = randomUUID().slice(0, 8);
  return prisma.park.create({
    data: {
      slug: `parque-${sufixo}`,
      name: overrides.name ?? `Parque Teste ${sufixo}`,
      timezone: overrides.timezone,
    },
  });
}

export async function createUser(input: {
  parkId: string;
  roles: RoleKey[];
  password?: string;
  passwordHash?: string;
  status?: UserStatus;
  mustChangePassword?: boolean;
  name?: string;
  email?: string;
}) {
  await ensureCatalog();
  const email = input.email ?? `pessoa-${randomUUID().slice(0, 8)}@teste.dev`;
  const password = input.password ?? DEFAULT_PASSWORD;
  const papeis = await prisma.role.findMany({ where: { key: { in: input.roles } }, select: { id: true } });
  const user = await prisma.user.create({
    data: {
      name: input.name ?? 'Pessoa de Teste',
      email,
      passwordHash: input.passwordHash ?? (await hashPassword(password)),
      status: input.status ?? 'ACTIVE',
      mustChangePassword: input.mustChangePassword ?? false,
      roles: { create: papeis.map(({ id }) => ({ parkId: input.parkId, roleId: id })) },
    },
  });
  return { ...user, password };
}

/** Sessão real (no banco) e o contexto de acesso resultante. */
export async function authAs(
  user: { id: string },
  parkId: string,
): Promise<{ auth: AuthContext; token: string }> {
  const { token } = await createSession(prisma, { userId: user.id, parkId, meta: meta() });
  const auth = await resolveSession(token);
  if (!auth) throw new Error('Sessão de teste inválida.');
  return { auth, token };
}

/** Espera que a promessa falhe com um AppError do código indicado e devolve o erro. */
export async function expectAppError(promessa: Promise<unknown>, code: ErrorCode): Promise<AppError> {
  try {
    await promessa;
  } catch (erro) {
    expect(erro).toBeInstanceOf(AppError);
    expect((erro as AppError).code).toBe(code);
    return erro as AppError;
  }
  throw new Error(`Era esperado o erro ${code}, mas a operação terminou sem erro.`);
}

export async function lastAudit(action: string, entityId?: string) {
  return prisma.auditLog.findFirst({
    where: { action, ...(entityId ? { entityId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}
