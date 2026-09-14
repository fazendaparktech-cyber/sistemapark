import 'server-only';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { DEFAULT_MARKETING_SETTINGS, marketingSettingsSchema, type MarketingSettings } from '@/lib/marketing';
import {
  DEFAULT_POLICIES,
  DEFAULT_SALES_SETTINGS,
  parkProfileSchema,
  policiesSchema,
  salesSettingsSchema,
  type ParkProfile,
  type ParkProfileInput,
  type Policies,
  type SalesSettings,
} from '@/lib/settings';

import { recordAudit } from '../audit';
import { requirePermission, type AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { Errors, fromZodError } from '../errors';
import type { RequestMeta } from '../request';

/**
 * Configurações do parque. Cada grupo é uma chave em `system_settings`,
 * validada pelo mesmo esquema do formulário. Chave ausente usa o padrão.
 */

type ChaveDeConfiguracao = 'sales' | 'policies' | 'marketing';

async function lerChave<T>(
  db: DbClient,
  parkId: string,
  key: ChaveDeConfiguracao,
  esquema: { safeParse: (valor: unknown) => { success: true; data: T } | { success: false } },
  padrao: T,
): Promise<T> {
  const linha = await db.systemSetting.findUnique({
    where: { parkId_key: { parkId, key } },
    select: { value: true },
  });
  if (!linha || typeof linha.value !== 'object' || linha.value === null || Array.isArray(linha.value))
    return padrao;
  // Campos novos entram com o valor padrão sem precisar de migração de dados.
  const resultado = esquema.safeParse({ ...padrao, ...(linha.value as Record<string, unknown>) });
  return resultado.success ? resultado.data : padrao;
}

export function getSalesSettings(parkId: string, db: DbClient = prisma): Promise<SalesSettings> {
  return lerChave(db, parkId, 'sales', salesSettingsSchema, DEFAULT_SALES_SETTINGS);
}

export function getPolicies(parkId: string, db: DbClient = prisma): Promise<Policies> {
  return lerChave(db, parkId, 'policies', policiesSchema, DEFAULT_POLICIES);
}

async function gravarChave(
  auth: AuthContext,
  key: ChaveDeConfiguracao,
  valor: Record<string, unknown>,
  auditoria: { action: string; before?: unknown; after?: unknown; data?: unknown },
  meta: RequestMeta,
  db: PrismaClient,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { parkId_key: { parkId: auth.park.id, key } },
      create: { parkId: auth.park.id, key, value: valor as Prisma.InputJsonValue, updatedById: auth.user.id },
      update: { value: valor as Prisma.InputJsonValue, updatedById: auth.user.id },
    });
    await recordAudit(tx, {
      action: auditoria.action,
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'setting',
      entityId: key,
      before: auditoria.before,
      after: auditoria.after,
      data: auditoria.data,
      meta,
    });
  });
}

export async function updateSalesSettings(
  auth: AuthContext,
  input: unknown,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<SalesSettings> {
  requirePermission(auth, 'settings.manage');
  const resultado = salesSettingsSchema.safeParse(input);
  if (!resultado.success) throw fromZodError(resultado.error);
  const antes = await getSalesSettings(auth.park.id, db);
  await gravarChave(
    auth,
    'sales',
    resultado.data,
    { action: 'settings.sales_updated', before: antes, after: resultado.data },
    meta,
    db,
  );
  return resultado.data;
}

export async function updatePolicies(
  auth: AuthContext,
  input: unknown,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<Policies> {
  requirePermission(auth, 'settings.manage');
  const resultado = policiesSchema.safeParse(input);
  if (!resultado.success) throw fromZodError(resultado.error);
  const antes = await getPolicies(auth.park.id, db);
  const alteradas = (Object.keys(resultado.data) as (keyof Policies)[]).filter(
    (chave) => antes[chave] !== resultado.data[chave],
  );
  if (alteradas.length > 0) {
    // Textos longos: a auditoria guarda quais políticas mudaram, não o texto inteiro duas vezes.
    await gravarChave(
      auth,
      'policies',
      resultado.data,
      { action: 'settings.policies_updated', data: { changed: alteradas } },
      meta,
      db,
    );
  }
  return resultado.data;
}

// ─── Marketing ──────────────────────────────────────────────────────────────

export function getMarketingSettings(parkId: string, db: DbClient = prisma): Promise<MarketingSettings> {
  return lerChave(db, parkId, 'marketing', marketingSettingsSchema, DEFAULT_MARKETING_SETTINGS);
}

export async function updateMarketingSettings(
  auth: AuthContext,
  input: unknown,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<MarketingSettings> {
  requirePermission(auth, 'marketing.manage');
  const resultado = marketingSettingsSchema.safeParse(input);
  if (!resultado.success) throw fromZodError(resultado.error);
  const antes = await getMarketingSettings(auth.park.id, db);
  await gravarChave(
    auth,
    'marketing',
    resultado.data,
    { action: 'marketing.settings_updated', before: antes, after: resultado.data },
    meta,
    db,
  );
  return resultado.data;
}

// ─── Dados do parque ────────────────────────────────────────────────────────

const CAMPOS_DO_PARQUE = {
  name: true,
  legalName: true,
  cnpj: true,
  email: true,
  phone: true,
  whatsapp: true,
  addressLine: true,
  city: true,
  state: true,
  postalCode: true,
  orderCodePrefix: true,
} as const;

export async function getParkProfile(parkId: string, db: DbClient = prisma): Promise<ParkProfile> {
  const parque = await db.park.findUnique({ where: { id: parkId }, select: CAMPOS_DO_PARQUE });
  if (!parque) throw Errors.notFound('Parque não encontrado.');
  return parque;
}

export async function updateParkProfile(
  auth: AuthContext,
  input: ParkProfileInput,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<ParkProfile> {
  requirePermission(auth, 'settings.manage');
  const resultado = parkProfileSchema.safeParse(input);
  if (!resultado.success) throw fromZodError(resultado.error);

  return db.$transaction(async (tx) => {
    const antes = await getParkProfile(auth.park.id, tx);
    const depois = await tx.park.update({
      where: { id: auth.park.id },
      data: resultado.data,
      select: CAMPOS_DO_PARQUE,
    });
    await recordAudit(tx, {
      action: 'settings.park_updated',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'park',
      entityId: auth.park.id,
      before: antes,
      after: depois,
      meta,
    });
    return depois;
  });
}
