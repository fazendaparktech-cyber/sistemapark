import { CircleCheck, Info, KeyRound, LogOut, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { NoPermission } from '@/components/admin/no-permission';
import { OperationsSettingsForm, ParkLogoForm } from '@/components/admin/settings/park-extra-forms';
import { ParkProfileForm, PoliciesForm, SalesSettingsForm } from '@/components/admin/settings/settings-forms';
import { LogoutButton } from '@/components/auth/logout-button';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHeader } from '@/components/ui/page-header';
import { formatPhoneBR } from '@/lib/documents';
import { MARKETING_INTEGRATIONS } from '@/lib/marketing';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { env, onlinePaymentsAvailable } from '@/server/env';
import type { SearchParamsRecord } from '@/server/filters';
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

type Aba =
  | 'geral'
  | 'parque'
  | 'funcionamento'
  | 'vendas'
  | 'pagamentos'
  | 'politicas'
  | 'comunicacao'
  | 'integracoes'
  | 'conta';

const GRUPOS: readonly { rotulo: string; abas: readonly { chave: Aba; rotulo: string }[] }[] = [
  {
    rotulo: 'Parque',
    abas: [
      { chave: 'geral', rotulo: 'Visão geral' },
      { chave: 'parque', rotulo: 'Dados do parque' },
      { chave: 'funcionamento', rotulo: 'Funcionamento' },
    ],
  },
  {
    rotulo: 'Vendas',
    abas: [
      { chave: 'vendas', rotulo: 'Vendas online' },
      { chave: 'pagamentos', rotulo: 'Pagamentos' },
      { chave: 'politicas', rotulo: 'Políticas' },
    ],
  },
  {
    rotulo: 'Canais',
    abas: [
      { chave: 'comunicacao', rotulo: 'Comunicação' },
      { chave: 'integracoes', rotulo: 'Integrações' },
    ],
  },
  { rotulo: 'Acesso', abas: [{ chave: 'conta', rotulo: 'Conta' }] },
];

const ABAS = GRUPOS.flatMap((grupo) => grupo.abas.map((item) => item.chave));
const LINK = 'text-sm font-semibold text-pool-700 hover:text-pool-800';

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
const CORES = { ok: 'text-success-700', pendente: 'text-warning-700', info: 'text-ink-400' };

/** Lista de itens com situação: pronto, pendente ou informativo. */
function ListaDeSituacao({ itens }: { itens: ItemDeSituacao[] }) {
  return (
    <ul className="divide-y divide-ink-100">
      {itens.map((item) => {
        const Icone = ICONES[item.situacao];
        return (
          <li key={item.chave} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <Icone className={cn('mt-0.5 size-[18px] shrink-0', CORES[item.situacao])} aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-ink-900">
                {item.titulo}
                {item.situacao === 'info' ? null : (
                  <span className="sr-only">{item.situacao === 'ok' ? ': pronto' : ': pendente'}</span>
                )}
              </p>
              <p className="mt-0.5 break-words leading-6 text-ink-600">{item.detalhe}</p>
            </div>
            {item.href ? (
              <Link href={item.href} className={cn(LINK, 'shrink-0 self-center')}>
                {item.acao ?? 'Resolver'}
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Secao({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={titulo} description={descricao} action={acao} />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const auth = await requirePageAuth();
  if (!can(auth, 'settings.view')) return <NoPermission />;

  const pedida = (await searchParams).aba;
  const aba: Aba = ABAS.find((chave) => chave === pedida) ?? 'geral';

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
  const config = env();
  const pagamentoReal = config.PAYMENT_PROVIDER !== 'mock';
  const pixNoSite = onlinePaymentsAvailable();
  const emailReal = config.EMAIL_PROVIDER !== 'mock';
  const prontos = prontidao.filter((item) => item.ok).length;

  let conteudo: ReactNode;
  switch (aba) {
    case 'geral':
      conteudo = (
        <Secao
          titulo="Visão geral"
          descricao={
            prontos === prontidao.length
              ? 'Tudo pronto para vender ao público.'
              : `${prontos} de ${prontidao.length} itens prontos. Resolva os pendentes antes de abrir as vendas ao público.`
          }
        >
          <ListaDeSituacao
            itens={prontidao.map((item) => ({
              chave: item.key,
              situacao: item.ok ? 'ok' : 'pendente',
              titulo: item.title,
              detalhe: item.detail,
              href: item.ok ? undefined : item.href,
            }))}
          />
        </Secao>
      );
      break;
    case 'parque':
      conteudo = (
        <Secao
          titulo="Dados do parque"
          descricao="Logo, identificação e contato usados no site, nos e-mails e nas políticas."
        >
          <div className="grid gap-6">
            <ParkLogoForm parkName={parque.name} logoVersion={versaoDaLogo} canManage={podeGerenciar} />
            <div className="border-t border-ink-100 pt-6">
              <ParkProfileForm initial={parque} canManage={podeGerenciar} />
            </div>
          </div>
        </Secao>
      );
      break;
    case 'funcionamento':
      conteudo = (
        <Secao
          titulo="Funcionamento"
          descricao="Dias, horários e capacidade que o parque costuma usar. Datas especiais e fechamentos ficam no calendário."
          acao={
            can(auth, 'calendar.view') ? (
              <Link href="/admin/calendario" className={LINK}>
                Abrir calendário
              </Link>
            ) : null
          }
        >
          <OperationsSettingsForm initial={funcionamento} canManage={podeGerenciar} />
        </Secao>
      );
      break;
    case 'vendas':
      conteudo = (
        <Secao titulo="Vendas online" descricao="Como o site vende: prazos, limites e antecedência.">
          <SalesSettingsForm initial={vendas} canManage={podeGerenciar} />
        </Secao>
      );
      break;
    case 'pagamentos':
      conteudo = (
        <Secao
          titulo="Pagamentos"
          descricao="Como o parque recebe. Chaves de provedores ficam só no servidor, nunca no painel."
        >
          <ListaDeSituacao
            itens={[
              {
                chave: 'provedor',
                situacao: pagamentoReal ? 'ok' : 'pendente',
                titulo: 'Provedor de pagamento',
                detalhe: pagamentoReal
                  ? 'Provedor real configurado.'
                  : 'Modo de teste: o PIX é simulado e nenhum dinheiro é recebido. Para vender de verdade, o parque precisa de conta num provedor de PIX (ex.: Asaas), ligada ao sistema com a chave guardada no servidor.',
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
                detalhe: 'Dinheiro com troco, cartão de débito e crédito na maquininha e PIX.',
                href: can(auth, 'pos.sell') ? '/admin/vendas/nova' : undefined,
                acao: 'Nova venda',
              },
            ]}
          />
        </Secao>
      );
      break;
    case 'politicas':
      conteudo = (
        <Secao
          titulo="Políticas"
          descricao="Cancelamento, termos de compra e privacidade. Publicadas no site e aceitas pelo cliente na compra."
        >
          <PoliciesForm initial={politicas} canManage={podeGerenciar} />
        </Secao>
      );
      break;
    case 'comunicacao':
      conteudo = (
        <Secao titulo="Comunicação" descricao="E-mails do pedido e atendimento pelo WhatsApp.">
          <ListaDeSituacao
            itens={[
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
                  : 'Não informado: o site fica sem botão de contato pelo WhatsApp.',
                href: parque.whatsapp ? undefined : '/admin/configuracoes?aba=parque',
                acao: 'Preencher',
              },
              {
                chave: 'envio-whatsapp',
                situacao: 'info',
                titulo: 'Ingressos pelo WhatsApp',
                detalhe:
                  'Em cada venda, o botão Enviar pelo WhatsApp abre a conversa com a mensagem e o link dos ingressos. Envio automático exige a API oficial do WhatsApp Business.',
              },
            ]}
          />
        </Secao>
      );
      break;
    case 'integracoes':
      conteudo = (
        <Secao
          titulo="Integrações"
          descricao="Pixels de anúncio e análise usados no site de vendas."
          acao={
            can(auth, 'marketing.view') ? (
              <Link href="/admin/marketing" className={LINK}>
                Configurar em Marketing
              </Link>
            ) : null
          }
        >
          <ListaDeSituacao
            itens={MARKETING_INTEGRATIONS.map((item) => {
              const valor = pixels[item.key];
              return {
                chave: item.key,
                situacao: valor ? 'ok' : 'info',
                titulo: item.label,
                detalhe: valor ? `Ligado: ${valor}` : 'Não configurado.',
              };
            })}
          />
        </Secao>
      );
      break;
    case 'conta':
      conteudo = (
        <Secao titulo="Conta" descricao={`Conta da empresa, conectada como ${auth.user.email}.`}>
          <ul className="divide-y divide-ink-100">
            <li className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-ink-900">Senha</p>
                <p className="mt-0.5 text-ink-600">
                  Troque a senha sempre que alguém deixar de ter acesso ao painel.
                </p>
              </div>
              <Link href="/trocar-senha" className={buttonClasses('secondary')}>
                <KeyRound className="size-4" aria-hidden />
                Trocar senha
              </Link>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-ink-900">Sair</p>
                <p className="mt-0.5 text-ink-600">Encerra a sessão neste aparelho.</p>
              </div>
              <LogoutButton variant="secondary">
                <LogOut className="size-4" aria-hidden />
                Sair
              </LogoutButton>
            </li>
          </ul>
        </Secao>
      );
      break;
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Configurações"
        description="Dados do parque, regras de venda, pagamentos, canais e acesso."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Seções das configurações"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:grid lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {GRUPOS.map((grupo) => (
            <div key={grupo.rotulo} className="flex shrink-0 gap-1 lg:block">
              <p className="mb-1.5 hidden px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-400 lg:block">
                {grupo.rotulo}
              </p>
              <ul className="flex gap-1 lg:grid lg:gap-0.5">
                {grupo.abas.map((item) => (
                  <li key={item.chave}>
                    <Link
                      href={
                        item.chave === 'geral'
                          ? '/admin/configuracoes'
                          : `/admin/configuracoes?aba=${item.chave}`
                      }
                      aria-current={aba === item.chave ? 'page' : undefined}
                      scroll={false}
                      className={cn(
                        'block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        aba === item.chave
                          ? 'bg-white text-ink-900 shadow-card ring-1 ring-ink-200/70'
                          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                      )}
                    >
                      {item.rotulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0">{conteudo}</div>
      </div>
    </div>
  );
}
