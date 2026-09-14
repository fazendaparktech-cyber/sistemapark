import 'server-only';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { DEFAULT_MARKETING_SETTINGS, marketingSettingsSchema, type MarketingSettings } from '@/lib/marketing';
import {
  DEFAULT_OPERATIONS_SETTINGS,
  DEFAULT_POLICIES,
  DEFAULT_SALES_SETTINGS,
  operationsSettingsSchema,
  PARK_LOGO_MAX_BYTES,
  parkLogoSchema,
  parkProfileSchema,
  policiesSchema,
  salesSettingsSchema,
  type OperationsSettings,
  type ParkProfile,
  type ParkProfileInput,
  type Policies,
  type SalesSettings,
} from '@/lib/settings';

import { recordAudit } from '../audit';
import { requirePermission, type AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { AppError, Errors, fromZodError } from '../errors';
import type { RequestMeta } from '../request';

/**
 * Configurações do parque. Cada grupo é uma chave em `system_settings`,
 * validada pelo mesmo esquema do formulário. Chave ausente usa o padrão.
 */

type ChaveDeConfiguracao = 'sales' | 'policies' | 'marketing' | 'operations';

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

// ─── Funcionamento ──────────────────────────────────────────────────────────

export function getOperationsSettings(parkId: string, db: DbClient = prisma): Promise<OperationsSettings> {
  return lerChave(db, parkId, 'operations', operationsSettingsSchema, DEFAULT_OPERATIONS_SETTINGS);
}

export async function updateOperationsSettings(
  auth: AuthContext,
  input: unknown,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<OperationsSettings> {
  requirePermission(auth, 'settings.manage');
  const resultado = operationsSettingsSchema.safeParse(input);
  if (!resultado.success) throw fromZodError(resultado.error);
  const antes = await getOperationsSettings(auth.park.id, db);
  await gravarChave(
    auth,
    'operations',
    resultado.data,
    { action: 'settings.operations_updated', before: antes, after: resultado.data },
    meta,
    db,
  );
  return resultado.data;
}

// ─── Logo ───────────────────────────────────────────────────────────────────

type TipoDeLogo = 'image/png' | 'image/jpeg' | 'image/webp';

/** Tipo real da imagem pelos primeiros bytes (SVG e outros formatos são recusados). */
function tipoPelosBytes(bytes: Uint8Array): TipoDeLogo | null {
  const comeca = (assinatura: number[], deslocamento = 0) =>
    assinatura.every((byte, indice) => bytes[deslocamento + indice] === byte);
  if (comeca([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (comeca([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (comeca([0x52, 0x49, 0x46, 0x46]) && comeca([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

function logoInvalida(mensagem: string): AppError {
  return new AppError('VALIDATION_ERROR', mensagem, { details: { fields: { dataUrl: mensagem } } });
}

export async function updateParkLogo(
  auth: AuthContext,
  input: unknown,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<{ version: number }> {
  requirePermission(auth, 'settings.manage');
  const resultado = parkLogoSchema.safeParse(input);
  if (!resultado.success) throw fromZodError(resultado.error);
  const base64 = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    resultado.data.dataUrl,
  )?.[1];
  if (!base64) throw logoInvalida('Envie uma imagem PNG, JPEG ou WebP.');
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  if (bytes.length > PARK_LOGO_MAX_BYTES) throw logoInvalida('A imagem passa de 300 KB.');
  const tipo = tipoPelosBytes(bytes);
  if (!tipo) throw logoInvalida('O arquivo não é uma imagem PNG, JPEG ou WebP válida.');

  const agora = new Date();
  await db.$transaction(async (tx) => {
    await tx.park.update({
      where: { id: auth.park.id },
      data: { logoMime: tipo, logoData: bytes, logoUpdatedAt: agora },
    });
    await recordAudit(tx, {
      action: 'settings.logo_updated',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'park',
      entityId: auth.park.id,
      data: { mime: tipo, bytes: bytes.length },
      meta,
    });
  });
  return { version: agora.getTime() };
}

export async function removeParkLogo(
  auth: AuthContext,
  meta: RequestMeta,
  db: PrismaClient = prisma,
): Promise<void> {
  requirePermission(auth, 'settings.manage');
  await db.$transaction(async (tx) => {
    await tx.park.update({
      where: { id: auth.park.id },
      data: { logoMime: null, logoData: null, logoUpdatedAt: null },
    });
    await recordAudit(tx, {
      action: 'settings.logo_removed',
      parkId: auth.park.id,
      actorUserId: auth.user.id,
      entityType: 'park',
      entityId: auth.park.id,
      meta,
    });
  });
}

export async function getParkLogo(
  parkId: string,
  db: DbClient = prisma,
): Promise<{ mime: string; data: Uint8Array } | null> {
  const parque = await db.park.findUnique({
    where: { id: parkId },
    select: { logoMime: true, logoData: true },
  });
  return parque?.logoMime && parque.logoData ? { mime: parque.logoMime, data: parque.logoData } : null;
}

/** Muda a cada envio (vai no endereço da imagem para não usar cópia antiga); `null` sem logo. */
export async function getParkLogoVersion(parkId: string, db: DbClient = prisma): Promise<number | null> {
  const parque = await db.park.findUnique({
    where: { id: parkId },
    select: { logoMime: true, logoUpdatedAt: true },
  });
  return parque?.logoMime && parque.logoUpdatedAt ? parque.logoUpdatedAt.getTime() : null;
}
