import 'server-only';

import { addDays, dateOnlyToDb, todayIn } from '@/lib/dates';

import { requirePermission, type AuthContext } from '../auth/context';
import { prisma, type DbClient } from '../db';
import { env, onlinePaymentsAvailable } from '../env';

/**
 * Prontidão para vender: o que já está configurado e o que falta, com o
 * caminho para resolver. Nada aqui altera dados.
 */

export interface ReadinessCheck {
  key: string;
  ok: boolean;
  title: string;
  detail: string;
  href?: string;
}

export async function getReadiness(auth: AuthContext, db: DbClient = prisma): Promise<ReadinessCheck[]> {
  requirePermission(auth, 'settings.view');
  const config = env();
  const hoje = todayIn(auth.park.timezone);

  const [diasAbertos, tiposOnline, parque, politicas] = await Promise.all([
    db.parkDay.count({
      where: {
        parkId: auth.park.id,
        status: 'OPEN',
        capacity: { gt: 0 },
        date: { gte: dateOnlyToDb(hoje), lte: dateOnlyToDb(addDays(hoje, 30)) },
      },
    }),
    db.ticketType.count({ where: { parkId: auth.park.id, isActive: true, channels: { has: 'ONLINE' } } }),
    db.park.findUniqueOrThrow({
      where: { id: auth.park.id },
      select: { cnpj: true, legalName: true, addressLine: true, city: true, whatsapp: true, email: true },
    }),
    db.systemSetting.findUnique({
      where: { parkId_key: { parkId: auth.park.id, key: 'policies' } },
      select: { updatedAt: true },
    }),
  ]);

  const pagamentoReal = config.PAYMENT_PROVIDER !== 'mock';
  const emailReal = config.EMAIL_PROVIDER !== 'mock';
  const https = config.APP_URL.startsWith('https://');
  const chaves = Boolean(
    config.QR_SIGNING_KEY && config.ORDER_LINK_KEY && config.CPF_HASH_KEY && config.CRON_SECRET,
  );
  const dadosCompletos = Boolean(parque.cnpj && parque.legalName && parque.addressLine && parque.city);
  const contato = Boolean(parque.whatsapp || parque.email);

  return [
    {
      key: 'calendar',
      ok: diasAbertos > 0,
      title: 'Datas abertas para venda',
      detail:
        diasAbertos > 0
          ? `${diasAbertos} ${diasAbertos === 1 ? 'dia aberto' : 'dias abertos'} nos próximos 30 dias.`
          : 'Nenhum dia aberto nos próximos 30 dias: o site não tem data para vender.',
      href: '/admin/calendario',
    },
    {
      key: 'ticket-types',
      ok: tiposOnline > 0,
      title: 'Ingressos à venda no site',
      detail:
        tiposOnline > 0
          ? `${tiposOnline} ${tiposOnline === 1 ? 'tipo de ingresso ativo' : 'tipos de ingresso ativos'} no site.`
          : 'Nenhum tipo de ingresso ativo para venda no site.',
      href: '/admin/tipos-de-ingresso',
    },
    {
      key: 'park',
      ok: dadosCompletos && contato,
      title: 'Dados do parque',
      detail:
        dadosCompletos && contato
          ? 'Razão social, CNPJ, endereço e contato preenchidos.'
          : 'Preencha razão social, CNPJ, endereço e um contato: aparecem no site, nos e-mails e nas políticas.',
      href: '/admin/configuracoes#dados-do-parque',
    },
    {
      key: 'policies',
      ok: Boolean(politicas),
      title: 'Políticas revisadas',
      detail: politicas
        ? 'Cancelamento, termos e privacidade já foram revisados pelo parque.'
        : 'O site usa textos padrão de cancelamento, termos e privacidade. Revise antes de vender.',
      href: '/admin/configuracoes#politicas',
    },
    {
      key: 'payments',
      ok: pagamentoReal && onlinePaymentsAvailable(),
      title: 'Pagamento online',
      detail: pagamentoReal
        ? 'Provedor de pagamento real configurado.'
        : 'Em modo de teste: o PIX é simulado e nenhum dinheiro é recebido. Em produção, o site só vende com o provedor real (Asaas) configurado.',
    },
    {
      key: 'email',
      ok: emailReal,
      title: 'Envio de e-mails',
      detail: emailReal
        ? 'Provedor de e-mail real configurado.'
        : 'Em modo de teste: os e-mails de pedido e de senha não saem do servidor.',
    },
    {
      key: 'keys',
      ok: chaves,
      title: 'Chaves de segurança',
      detail: chaves
        ? 'Chaves do QR Code, dos links de pedido, do CPF e da rotina configuradas.'
        : 'Usando chaves de desenvolvimento. Em produção, configure QR_SIGNING_KEY, ORDER_LINK_KEY, CPF_HASH_KEY e CRON_SECRET.',
    },
    {
      key: 'https',
      ok: https,
      title: 'Endereço seguro (https)',
      detail: https
        ? config.APP_URL
        : 'Rodando em endereço local. Em produção o sistema precisa de domínio com https.',
    },
  ];
}
