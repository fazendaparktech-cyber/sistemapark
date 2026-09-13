import 'server-only';

import { isRoleKey, SUPER_ADMIN_ROLE, type RoleKey } from '@/lib/access';

import { can, type AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { env } from '../env';

/**
 * Visão geral da fase 1: equipe, atividade e prontidão da configuração.
 * Cada bloco só é calculado para quem tem a permissão correspondente.
 * Os indicadores de venda entram na fase 7.
 */

export interface SetupCheck {
  key: string;
  ok: boolean;
  title: string;
  detail: string;
  href?: string;
}

export interface OverviewData {
  team: { active: number; withoutAccess: number; onlineNow: number } | null;
  recentLogins: { id: string; name: string; roles: RoleKey[]; lastLoginAt: Date }[] | null;
  activity24h: number | null;
  setup: SetupCheck[] | null;
}

const JANELA_ONLINE_MS = 15 * 60 * 1000;

export async function getOverview(auth: AuthContext, db: DbClient = prisma): Promise<OverviewData> {
  const parkId = auth.park.id;
  const agora = Date.now();
  const verEquipe = can(auth, 'users.view');
  const verAuditoria = can(auth, 'audit.view');
  const verConfiguracao = can(auth, 'settings.view');

  const [porSituacao, conectados, ultimosAcessos, atividade, superAdmins] = await Promise.all([
    verEquipe
      ? db.user.groupBy({ by: ['status'], where: { roles: { some: { parkId } } }, _count: { _all: true } })
      : null,
    verEquipe
      ? db.session.findMany({
          where: {
            parkId,
            revokedAt: null,
            expiresAt: { gt: new Date(agora) },
            lastSeenAt: { gt: new Date(agora - JANELA_ONLINE_MS) },
            user: { status: 'ACTIVE' },
          },
          distinct: ['userId'],
          select: { userId: true },
        })
      : null,
    verEquipe
      ? db.user.findMany({
          where: { roles: { some: { parkId } }, lastLoginAt: { not: null } },
          orderBy: { lastLoginAt: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            lastLoginAt: true,
            roles: { where: { parkId }, select: { role: { select: { key: true } } } },
          },
        })
      : null,
    verAuditoria
      ? db.auditLog.count({ where: { parkId, createdAt: { gte: new Date(agora - 86_400_000) } } })
      : null,
    verConfiguracao
      ? db.userRole.count({ where: { parkId, role: { key: SUPER_ADMIN_ROLE }, user: { status: 'ACTIVE' } } })
      : null,
  ]);

  const team = porSituacao
    ? {
        active: porSituacao.find((linha) => linha.status === 'ACTIVE')?._count._all ?? 0,
        withoutAccess: porSituacao
          .filter((linha) => linha.status !== 'ACTIVE')
          .reduce((soma, linha) => soma + linha._count._all, 0),
        onlineNow: conectados?.length ?? 0,
      }
    : null;

  const recentLogins = ultimosAcessos
    ? ultimosAcessos.flatMap((pessoa) =>
        pessoa.lastLoginAt
          ? [
              {
                id: pessoa.id,
                name: pessoa.name,
                lastLoginAt: pessoa.lastLoginAt,
                roles: pessoa.roles.map((vinculo) => vinculo.role.key).filter(isRoleKey),
              },
            ]
          : [],
      )
    : null;

  let setup: SetupCheck[] | null = null;
  if (verConfiguracao) {
    const config = env();
    const emailReal = config.EMAIL_PROVIDER !== 'mock';
    const https = config.APP_URL.startsWith('https://');
    const doisSuperAdmins = (superAdmins ?? 0) >= 2;
    setup = [
      {
        key: 'email',
        ok: emailReal,
        title: 'Envio de e-mails',
        detail: emailReal
          ? 'Provedor de e-mail real configurado.'
          : 'Em modo de teste: os e-mails não saem do servidor. Configure a Resend antes de colocar em produção.',
      },
      {
        key: 'https',
        ok: https,
        title: 'Endereço seguro (https)',
        detail: https
          ? config.APP_URL
          : 'O sistema está rodando em endereço local. Em produção ele precisa de domínio com https.',
      },
      {
        key: 'super-admins',
        ok: doisSuperAdmins,
        title: 'Dois super admins',
        detail: doisSuperAdmins
          ? `${superAdmins} pessoas com acesso total.`
          : 'Só uma pessoa tem acesso total. Nomeie uma segunda para não correr o risco de ficar sem acesso.',
        href: doisSuperAdmins ? undefined : '/admin/equipe',
      },
    ];
  }

  return { team, recentLogins, activity24h: atividade, setup };
}
