import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { NoPermission } from '@/components/admin/no-permission';
import { OperationsSettingsForm, ParkLogoForm } from '@/components/admin/settings/park-extra-forms';
import { ParkProfileForm, PoliciesForm, SalesSettingsForm } from '@/components/admin/settings/settings-forms';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHeader } from '@/components/ui/page-header';
import { formatPhoneBR } from '@/lib/documents';
import { MARKETING_INTEGRATIONS } from '@/lib/marketing';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { env, onlinePaymentsAvailable } from '@/server/env';
import { getReadiness } from '@/server/settings/readiness';
import {
  getMarketingSettings,
  getOperationsSettings,
  getParkLogoVersion,
  getParkProfile,
  getPolicies,
  getSalesSettings,
} from '@/server/settings/service';

export const metadata: Metadata = { title: 'Configurações' };

const SECOES = [
  { id: 'prontidao', label: 'Prontidão para vender' },
  { id: 'dados-do-parque', label: 'Dados do parque' },
  { id: 'funcionamento', label: 'Funcionamento' },
  { id: 'vendas-online', label: 'Vendas online' },
  { id: 'pagamentos', label: 'Pagamentos' },
  { id: 'comunicacao', label: 'Comunicação' },
  { id: 'integracoes', label: 'Integrações' },
  { id: 'politicas', label: 'Políticas' },
];

type Situacao = 'ok' | 'pendente' | 'info';

interface ItemDeSituacao {
  chave: string;
  situacao: Situacao;
  titulo: string;
  detalhe: string;
  href?: string;
  acao?: string;
}

const ICONES = { ok: CircleCheck, pendente: TriangleAlert, info: Info };
const FUNDOS = {
  ok: 'bg-success-50/60 ring-success-600/15',
  pendente: 'bg-warning-50 ring-warning-600/20',
  info: 'bg-ink-50 ring-ink-200/70',
};
const CORES = { ok: 'text-success-700', pendente: 'text-warning-700', info: 'text-ink-500' };

function ListaDeSituacao({ itens }: { itens: ItemDeSituacao[] }) {
  return (
    <ul className="grid gap-3">
      {itens.map((item) => {
        const Icone = ICONES[item.situacao];
        return (
          <li
            key={item.chave}
            className={cn('flex gap-3 rounded-xl px-4 py-3 ring-1 ring-inset', FUNDOS[item.situacao])}
          >
            <Icone className={cn('mt-0.5 size-5 shrink-0', CORES[item.situacao])} aria-hidden />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink-900">
                {item.titulo}
                {item.situacao === 'info' ? null : (
                  <span className="sr-only">{item.situacao === 'ok' ? ': pronto' : ': pendente'}</span>
                )}
              </p>
              <p className="mt-0.5 break-words leading-6 text-ink-600">{item.detalhe}</p>
              {item.href ? (
                <Link
                  href={item.href}
                  className="mt-1 inline-block font-semibold text-pool-700 hover:text-pool-800"
                >
                  {item.acao ?? 'Resolver'}
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function ConfiguracoesPage() {
  const auth = await requirePageAuth();
  if (!can(auth, 'settings.view')) return <NoPermission />;

  const [vendas, parque, politicas, prontidao, funcionamento, pixels, versaoDaLogo] = await Promise.all([
    getSalesSettings(auth.park.id),
    getParkProfile(auth.park.id),
    getPolicies(auth.park.id),
    getReadiness(auth),
    getOperationsSettings(auth.park.id),
    getMarketingSettings(auth.park.id),
    getParkLogoVersion(auth.park.id),
  ]);
  const podeGerenciar = can(auth, 'settings.manage');
  const pendentes = prontidao.filter((item) => !item.ok).length;
  const config = env();
  const pagamentoReal = config.PAYMENT_PROVIDER !== 'mock';
  const pixNoSite = onlinePaymentsAvailable();
  const emailReal = config.EMAIL_PROVIDER !== 'mock';

  const pagamentos: ItemDeSituacao[] = [
    {
      chave: 'provedor',
      situacao: pagamentoReal ? 'ok' : 'pendente',
      titulo: 'Provedor de pagamento',
      detalhe: pagamentoReal
        ? 'Provedor real configurado.'
        : 'Modo de teste: o PIX é simulado e nenhum dinheiro é recebido. Para vender de verdade, o parque precisa de conta num provedor de PIX (ex.: Asaas), ligada ao sistema com a chave de API guardada no servidor.',
    },
    {
      chave: 'pix',
      situacao: pixNoSite ? 'ok' : 'pendente',
      titulo: 'PIX no site',
      detalhe: pixNoSite
        ? pagamentoReal
          ? 'Ativo: QR Code e copia e cola, com confirmação automática.'
          : 'Ativo em modo de teste, com botão para simular o pagamento.'
        : 'Bloqueado: em produção o site só vende com provedor real.',
    },
    {
      chave: 'cartao',
      situacao: 'info',
      titulo: 'Cartão no site',
      detalhe: 'O site vende com PIX. Cartão online depende de habilitar no provedor de pagamento.',
    },
    {
      chave: 'balcao',
      situacao: 'ok',
      titulo: 'Venda presencial',
      detalhe:
        'Dinheiro (com troco), cartão de débito e crédito na maquininha e PIX, registrados em Nova venda.',
      href: can(auth, 'pos.sell') ? '/admin/vendas/nova' : undefined,
      acao: 'Abrir venda presencial',
    },
  ];

  const comunicacao: ItemDeSituacao[] = [
    {
      chave: 'email',
      situacao: emailReal ? 'ok' : 'pendente',
      titulo: 'E-mails do pedido',
      detalhe: emailReal
        ? `Enviados como ${config.EMAIL_FROM}: pedido recebido, ingressos, cancelamento, reembolso e senha.`
        : 'Modo de teste: os e-mails de pedido e de senha não saem do servidor. Em produção, configure o provedor de e-mail no servidor.',
    },
    {
      chave: 'whatsapp',
      situacao: parque.whatsapp ? 'ok' : 'pendente',
      titulo: 'WhatsApp de atendimento',
      detalhe: parque.whatsapp
        ? `${formatPhoneBR(parque.whatsapp)}, no botão de contato do site e na página do pedido.`
        : 'Não informado. Preencha em Dados do parque para mostrar o botão de contato no site.',
      href: parque.whatsapp ? undefined : '#dados-do-parque',
      acao: 'Preencher',
    },
    {
      chave: 'envio-whatsapp',
      situacao: 'info',
      titulo: 'Ingressos pelo WhatsApp',
      detalhe:
        'Em cada venda, o botão Enviar pelo WhatsApp abre a conversa com a mensagem e o link dos ingressos. Envio automático, sem abrir a conversa, exige a API oficial do WhatsApp Business.',
    },
  ];

  const integracoes: ItemDeSituacao[] = MARKETING_INTEGRATIONS.map((item) => {
    const valor = pixels[item.key];
    return {
      chave: item.key,
      situacao: valor ? 'ok' : 'info',
      titulo: item.label,
      detalhe: valor ? `Ligado: ${valor}` : 'Não configurado.',
    };
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Configurações"
        description="Dados do parque, funcionamento, vendas online, pagamentos, comunicação, integrações e políticas."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Seções das configurações"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:sticky lg:top-24 lg:mx-0 lg:grid lg:overflow-visible lg:px-0"
        >
          {SECOES.map((secao) => (
            <a
              key={secao.id}
              href={`#${secao.id}`}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {secao.label}
            </a>
          ))}
        </nav>

        <div className="grid gap-6">
          <Card id="prontidao" className="scroll-mt-24">
            <CardHeader
              title="Prontidão para vender"
              description={
                pendentes === 0
                  ? 'Tudo pronto para vender.'
                  : `${pendentes} ${pendentes === 1 ? 'item pendente' : 'itens pendentes'} antes de abrir as vendas ao público.`
              }
            />
            <CardContent>
              <ListaDeSituacao
                itens={prontidao.map((item) => ({
                  chave: item.key,
                  situacao: item.ok ? 'ok' : 'pendente',
                  titulo: item.title,
                  detalhe: item.detail,
                  href: item.ok ? undefined : item.href,
                }))}
              />
            </CardContent>
          </Card>

          <Card id="dados-do-parque" className="scroll-mt-24">
            <CardHeader
              title="Dados do parque"
              description="Logo, identificação e contato usados no site, nos e-mails e nas políticas."
            />
            <CardContent className="grid gap-6">
              <ParkLogoForm parkName={parque.name} logoVersion={versaoDaLogo} canManage={podeGerenciar} />
              <div className="border-t border-ink-100 pt-6">
                <ParkProfileForm initial={parque} canManage={podeGerenciar} />
              </div>
            </CardContent>
          </Card>

          <Card id="funcionamento" className="scroll-mt-24">
            <CardHeader
              title="Funcionamento"
              description="Dias, horários e capacidade que o parque costuma usar. Datas especiais e fechamentos ficam no calendário."
              action={
                can(auth, 'calendar.view') ? (
                  <Link
                    href="/admin/calendario"
                    className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                  >
                    Abrir calendário
                  </Link>
                ) : null
              }
            />
            <CardContent>
              <OperationsSettingsForm initial={funcionamento} canManage={podeGerenciar} />
            </CardContent>
          </Card>

          <Card id="vendas-online" className="scroll-mt-24">
            <CardHeader
              title="Vendas online"
              description="Como o site vende: prazos, limites e antecedência."
            />
            <CardContent>
              <SalesSettingsForm initial={vendas} canManage={podeGerenciar} />
            </CardContent>
          </Card>

          <Card id="pagamentos" className="scroll-mt-24">
            <CardHeader
              title="Pagamentos"
              description="Como o parque recebe. Chaves de provedores ficam só no servidor, nunca no painel."
            />
            <CardContent>
              <ListaDeSituacao itens={pagamentos} />
            </CardContent>
          </Card>

          <Card id="comunicacao" className="scroll-mt-24">
            <CardHeader title="Comunicação" description="E-mails do pedido e atendimento pelo WhatsApp." />
            <CardContent>
              <ListaDeSituacao itens={comunicacao} />
            </CardContent>
          </Card>

          <Card id="integracoes" className="scroll-mt-24">
            <CardHeader
              title="Integrações"
              description="Pixels de anúncio e análise: Meta, TikTok e Google."
              action={
                can(auth, 'marketing.view') ? (
                  <Link
                    href="/admin/marketing"
                    className="text-sm font-semibold text-pool-700 hover:text-pool-800"
                  >
                    Configurar em Marketing
                  </Link>
                ) : null
              }
            />
            <CardContent>
              <ListaDeSituacao itens={integracoes} />
            </CardContent>
          </Card>

          <Card id="politicas" className="scroll-mt-24">
            <CardHeader
              title="Políticas"
              description="Cancelamento, termos de compra e privacidade. Publicadas no site e aceitas pelo cliente na compra."
            />
            <CardContent>
              <PoliciesForm initial={politicas} canManage={podeGerenciar} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
