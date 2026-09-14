import 'server-only';

import type { NotificationSeverity, NotificationType, Prisma } from '@/generated/prisma/client';
import type { PermissionKey } from '@/lib/access';
import { uuidSchema, z } from '@/lib/validation';

import type { AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { fromZodError } from '../errors';

/**
 * Avisos do sino do painel (lotação perto do limite, pagamento com problema,
 * falha de envio, ingresso duplicado). Cada aviso exige uma permissão para ser
 * visto e tem uma chave que impede repetição; a leitura é por pessoa.
 */

const DIAS_VISIVEIS = 30;
const LIMITE_DA_LISTA = 30;

export interface NewNotification {
  parkId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href: string | null;
  permission: PermissionKey;
  /** Mesma chave no mesmo parque não cria outro aviso. */
  dedupeKey: string;
}

export async function notify(db: DbClient, aviso: NewNotification): Promise<void> {
  await db.notification.createMany({
    data: [
      {
        ...aviso,
        title: aviso.title.slice(0, 160),
        body: aviso.body.slice(0, 500),
        dedupeKey: aviso.dedupeKey.slice(0, 160),
      },
    ],
    skipDuplicates: true,
  });
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href: string | null;
  createdAt: Date;
  read: boolean;
}

function visiveis(auth: AuthContext): Prisma.NotificationWhereInput {
  return {
    parkId: auth.park.id,
    permission: { in: [...auth.permissions] },
    createdAt: { gte: new Date(Date.now() - DIAS_VISIVEIS * 86_400_000) },
  };
}

export async function listNotifications(
  auth: AuthContext,
  db: DbClient = prisma,
): Promise<{ items: NotificationItem[]; unread: number }> {
  const where = visiveis(auth);
  const [avisos, naoLidos] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIMITE_DA_LISTA,
      select: {
        id: true,
        type: true,
        severity: true,
        title: true,
        body: true,
        href: true,
        createdAt: true,
        reads: { where: { userId: auth.user.id }, select: { readAt: true } },
      },
    }),
    db.notification.count({ where: { ...where, reads: { none: { userId: auth.user.id } } } }),
  ]);
  return {
    items: avisos.map(({ reads, ...aviso }) => ({ ...aviso, read: reads.length > 0 })),
    unread: naoLidos,
  };
}

export const markNotificationsReadSchema = z.strictObject({
  ids: z.array(uuidSchema).max(100).optional(),
  all: z.boolean().optional(),
});

export async function markNotificationsRead(
  auth: AuthContext,
  input: z.input<typeof markNotificationsReadSchema>,
  db: DbClient = prisma,
): Promise<{ unread: number }> {
  const parsed = markNotificationsReadSchema.safeParse(input);
  if (!parsed.success) throw fromZodError(parsed.error);
  const { ids, all } = parsed.data;
  const where = visiveis(auth);

  if (all || (ids && ids.length > 0)) {
    const pendentes = await db.notification.findMany({
      where: { ...where, ...(all ? {} : { id: { in: ids } }), reads: { none: { userId: auth.user.id } } },
      select: { id: true },
    });
    if (pendentes.length > 0) {
      await db.notificationRead.createMany({
        data: pendentes.map((aviso) => ({ notificationId: aviso.id, userId: auth.user.id })),
        skipDuplicates: true,
      });
    }
  }
  return {
    unread: await db.notification.count({ where: { ...where, reads: { none: { userId: auth.user.id } } } }),
  };
}
