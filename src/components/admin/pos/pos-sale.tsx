'use client';

import {
  Banknote,
  CircleCheck,
  CircleX,
  CreditCard,
  ExternalLink,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { holderRequirements } from '@/lib/catalog';
import { formatDateBR, weekdayOf, type DateOnly } from '@/lib/dates';
import { formatCpfInput, formatPhoneBR, normalizePhoneBR } from '@/lib/documents';
import { formatNumber, formatPercent, plural } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { PAYMENT_METHOD_LABELS, type PosPaymentMethod, type PosSaleInput } from '@/lib/orders';
import { formatDateLong, WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import type {
  PosOffer,
  PosPix,
  PosQuote,
  PosSaleResult,
  PosSaleStatus,
  PosTicketOption,
} from '@/server/sales/pos';

import { QuantityStepper } from '../../site/quantity-stepper';
import { Alert } from '../../ui/alert';
import { Button, buttonClasses } from '../../ui/button';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { cn } from '../../ui/cn';
import { CopyButton } from '../../ui/copy-button';
import { Spinner } from '../../ui/feedback';
import { Checkbox, Field, fieldIds, Input } from '../../ui/field';
import { MoneyInput } from '../../ui/money-input';

/** Datas chegam da API como texto. */
type PixNaTela = Omit<PosPix, 'expiresAt'> & { expiresAt: string | null };
type ResultadoNaTela = Omit<PosSaleResult, 'pix'> & { pix: PixNaTela | null };
type SituacaoNaTela = Omit<PosSaleStatus, 'pix'> & { pix: PixNaTela | null };

interface ClienteEncontrado {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfMasked: string | null;
}

interface Visitante {
  name: string;
  cpf: string;
  birthDate: string;
}

const FORMAS: { key: PosPaymentMethod; label: string; icon: LucideIcon }[] = [
  { key: 'CASH', label: 'Dinheiro', icon: Banknote },
  { key: 'DEBIT_CARD', label: 'Débito', icon: CreditCard },
  { key: 'CREDIT_CARD', label: 'Crédito', icon: CreditCard },
  { key: 'PIX', label: 'PIX', icon: QrCode },
];

const NOTAS = [5000, 10000, 20000];
const LIMITE_POR_TIPO = 200;

function novaChave(): string {
  return crypto.randomUUID();
}

function limiteDoTipo(tipo: PosTicketOption): number {
  return Math.min(tipo.maxPerOrder ?? LIMITE_POR_TIPO, tipo.remainingUnits ?? LIMITE_POR_TIPO);
}

function detalheDoTipo(tipo: PosTicketOption): string | null {
  const partes: string[] = [];
  if (tipo.minAge !== null && tipo.maxAge !== null) partes.push(`${tipo.minAge} a ${tipo.maxAge} anos`);
  else if (tipo.maxAge !== null) partes.push(`até ${tipo.maxAge} anos`);
  else if (tipo.minAge !== null && tipo.minAge > 0) partes.push(`a partir de ${tipo.minAge} anos`);
  if (tipo.peoplePerTicket > 1) partes.push(`${tipo.peoplePerTicket} pessoas por ingresso`);
  if (tipo.remainingUnits !== null) partes.push(`restam ${formatNumber(tipo.remainingUnits)}`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

// ─── Busca de cliente ───────────────────────────────────────────────────────

function BuscaDeCliente({ onSelect }: { onSelect: (cliente: ClienteEncontrado) => void }) {
  const [termo, setTermo] = useState('');
  const [resposta, setResposta] = useState<{ termo: string; itens: ClienteEncontrado[] } | null>(null);
  const busca = termo.trim();

  useEffect(() => {
    if (busca.length < 3) return;
    const controle = new AbortController();
    const espera = setTimeout(() => {
      api<{ items: ClienteEncontrado[] }>(`/api/admin/customers?q=${encodeURIComponent(busca)}`, {
        signal: controle.signal,
      })
        .then((dados) => setResposta({ termo: busca, itens: dados.items.slice(0, 6) }))
        .catch((falha: unknown) => {
          if (falha instanceof DOMException && falha.name === 'AbortError') return;
          setResposta({ termo: busca, itens: [] });
        });
    }, 300);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [busca]);

  const atual = resposta?.termo === busca ? resposta : null;

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
          aria-hidden
        />
        <Input
          value={termo}
          onChange={(evento) => setTermo(evento.target.value)}
          placeholder="Buscar cliente cadastrado por nome, CPF, celular ou e-mail"
          aria-label="Buscar cliente cadastrado"
          className="pl-10"
        />
      </div>
      {busca.length >= 3 ? (
        <div className="rounded-xl ring-1 ring-inset ring-ink-200">
          {!atual ? (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-ink-500">
              <Spinner className="size-4" />
              Buscando clientes
            </p>
          ) : atual.itens.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-500">
              Nenhum cliente encontrado. Preencha os dados abaixo para cadastrar com a venda.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {atual.itens.map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(cliente);
                      setTermo('');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-pool-50/60"
                  >
                    <UserRound className="size-4 shrink-0 text-ink-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">
                        {cliente.name}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {[
                          cliente.cpfMasked ? `CPF ${cliente.cpfMasked}` : null,
                          cliente.phone ? formatPhoneBR(cliente.phone) : null,
                          cliente.email,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Sem contato cadastrado'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Depois da venda ────────────────────────────────────────────────────────

function TelaDoResultado({
  venda,
  onNovaVenda,
  canViewOrders,
  canResend,
}: {
  venda: ResultadoNaTela;
  onNovaVenda: () => void;
  canViewOrders: boolean;
  canResend: boolean;
}) {
  const [situacao, setSituacao] = useState<SituacaoNaTela>({
    orderId: venda.orderId,
    code: venda.code,
    status: venda.status,
    totalCents: venda.totalCents,
    publicUrl: venda.publicUrl,
    hasPhone: venda.hasPhone,
    pix: venda.pix,
    canSimulate: false,
  });
  const [agora, setAgora] = useState(() => Date.now());
  const [ocupado, setOcupado] = useState(false);
  const pendente = situacao.status === 'PENDING_PAYMENT';

  useEffect(() => {
    if (!pendente) return;
    const atualizar = () =>
      api<SituacaoNaTela>(`/api/admin/pos/sales/${venda.orderId}`)
        .then((dados) => setSituacao(dados))
        .catch(() => undefined);
    void atualizar();
    const consulta = setInterval(atualizar, 3000);
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      clearInterval(consulta);
      clearInterval(relogio);
    };
  }, [pendente, venda.orderId]);

  async function acao(caminho: string, corpo?: unknown) {
    setOcupado(true);
    try {
      setSituacao(await api<SituacaoNaTela>(caminho, { method: 'POST', body: corpo }));
    } catch (falha) {
      toast.error(errorMessage(falha));
    } finally {
      setOcupado(false);
    }
  }

  async function enviarWhatsapp() {
    // Abre a janela no clique (senão o navegador bloqueia) e só depois recebe o link.
    const janela = window.open('', '_blank');
    try {
      const { url } = await api<{ url: string }>(`/api/admin/orders/${venda.orderId}/whatsapp`, {
        method: 'POST',
      });
      if (janela) janela.location.href = url;
      else window.location.href = url;
    } catch (falha) {
      janela?.close();
      toast.error(errorMessage(falha));
    }
  }

  if (situacao.status === 'CONFIRMED') {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardContent className="grid gap-6 py-8 text-center sm:py-10">
          <div className="grid justify-items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-success-50 text-success-700 ring-1 ring-success-600/20">
              <CircleCheck className="size-7" aria-hidden />
            </span>
            <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">
              Venda confirmada
            </h2>
            <p className="text-sm text-ink-500">
              Pedido <span className="font-mono font-semibold text-ink-800">{situacao.code}</span> ·{' '}
              {PAYMENT_METHOD_LABELS[venda.paymentMethod]} · {formatBRL(situacao.totalCents)}
            </p>
          </div>

          {venda.changeCents !== null && venda.changeCents > 0 ? (
            <div className="rounded-2xl bg-sun-50 px-5 py-4 ring-1 ring-inset ring-sun-200">
              <p className="text-sm font-semibold text-ink-700">Troco a devolver</p>
              <p className="tabular font-display text-3xl font-semibold text-ink-950">
                {formatBRL(venda.changeCents)}
              </p>
            </div>
          ) : null}
          {venda.emailSent ? (
            <p className="text-sm text-ink-600">
              Os ingressos também foram enviados para o e-mail do cliente.
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href={situacao.publicUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonClasses('primary', 'lg', 'w-full')}
            >
              <ExternalLink className="size-4" aria-hidden />
              Abrir ingressos para imprimir
            </a>
            {situacao.hasPhone && canResend ? (
              <Button variant="secondary" size="lg" className="w-full" onClick={enviarWhatsapp}>
                <MessageCircle className="size-4" aria-hidden />
                Enviar pelo WhatsApp
              </Button>
            ) : (
              <CopyButton
                value={situacao.publicUrl}
                label="Copiar link dos ingressos"
                size="lg"
                className="w-full"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {situacao.hasPhone && canResend ? (
              <CopyButton value={situacao.publicUrl} label="Copiar link" variant="ghost" />
            ) : null}
            {canViewOrders ? (
              <Link href={`/admin/vendas/${situacao.orderId}`} className={buttonClasses('ghost')}>
                Ver detalhes da venda
              </Link>
            ) : null}
            <Button variant="cta" onClick={onNovaVenda}>
              <Plus className="size-4" aria-hidden />
              Nova venda
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pendente) {
    const pix = situacao.pix;
    const segundos = pix?.expiresAt
      ? Math.max(0, Math.floor((new Date(pix.expiresAt).getTime() - agora) / 1000))
      : null;
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardContent className="grid gap-5 py-8 text-center">
          <div className="grid gap-1">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">
              PIX de {formatBRL(situacao.totalCents)}
            </h2>
            <p className="text-sm text-ink-500">
              Pedido <span className="font-mono font-semibold text-ink-800">{situacao.code}</span>. Peça ao
              cliente para ler o QR Code no aplicativo do banco.
            </p>
          </div>

          {pix ? (
            <>
              <div
                className="mx-auto size-60 rounded-2xl bg-white p-3 ring-1 ring-ink-200 [&_svg]:size-full"
                aria-label="QR Code do PIX"
                role="img"
                dangerouslySetInnerHTML={{ __html: pix.qrSvg }}
              />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <CopyButton value={pix.payload} label="Copiar código PIX" />
              </div>
              <p className="flex items-center justify-center gap-2 text-sm text-ink-600">
                <Spinner className="size-4 text-pool-700" />
                Aguardando o pagamento
                {segundos !== null
                  ? ` · vence em ${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
                  : ''}
              </p>
              {situacao.canSimulate ? (
                <div className="grid gap-2 rounded-xl bg-ink-50 p-3 ring-1 ring-inset ring-ink-200">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                    Ambiente de teste
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={ocupado}
                      onClick={() =>
                        void acao(`/api/admin/pos/sales/${venda.orderId}/simulate`, { outcome: 'APPROVED' })
                      }
                    >
                      <CircleCheck className="size-4 text-success-700" aria-hidden />
                      Simular PIX pago
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={ocupado}
                      onClick={() =>
                        void acao(`/api/admin/pos/sales/${venda.orderId}/simulate`, { outcome: 'DECLINED' })
                      }
                    >
                      <CircleX className="size-4 text-danger-700" aria-hidden />
                      Simular recusa
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <Alert tone="warning" title="PIX não disponível" className="text-left">
              {venda.pixError ?? 'A cobrança venceu ou foi recusada. Gere um novo PIX para o cliente pagar.'}
            </Alert>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            {!pix ? (
              <Button
                loading={ocupado}
                onClick={() => void acao(`/api/admin/pos/sales/${venda.orderId}/pix`)}
              >
                <RefreshCw className="size-4" aria-hidden />
                Gerar novo PIX
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onNovaVenda}>
              Fazer outra venda
            </Button>
          </div>
          <p className="text-xs text-ink-500">
            Se o cliente desistir, o PIX vence sozinho e as vagas voltam para venda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardContent className="grid gap-5 py-8 text-center">
        <Alert tone="danger" title="Venda não concluída" className="text-left">
          O prazo do PIX terminou sem pagamento e a venda {situacao.code} foi cancelada. As vagas voltaram
          para venda.
        </Alert>
        <div className="flex justify-center">
          <Button onClick={onNovaVenda}>
            <Plus className="size-4" aria-hidden />
            Nova venda
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tela de venda ──────────────────────────────────────────────────────────

export function PosSale({
  initialOffer,
  canSearchCustomers,
  canViewOrders,
  canResend,
}: {
  initialOffer: PosOffer;
  canSearchCustomers: boolean;
  canViewOrders: boolean;
  canResend: boolean;
}) {
  const [oferta, setOferta] = useState(initialOffer);
  const [carregandoData, setCarregandoData] = useState<DateOnly | null>(null);
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [cliente, setCliente] = useState<ClienteEncontrado | null>(null);
  const [nome, setNome] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [aceitaComunicacoes, setAceitaComunicacoes] = useState(false);
  const [visitantes, setVisitantes] = useState<Record<string, Visitante[]>>({});
  const [cupomDigitado, setCupomDigitado] = useState('');
  const [cupom, setCupom] = useState<string | null>(null);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [motivoDoDesconto, setMotivoDoDesconto] = useState('');
  const [forma, setForma] = useState<PosPaymentMethod>('CASH');
  const [recebido, setRecebido] = useState<number | null>(null);
  const [versaoDosCampos, setVersaoDosCampos] = useState(0);
  const [previa, setPrevia] = useState<{ chave: string; dados: PosQuote | null; erro: string | null } | null>(
    null,
  );
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [chave, setChave] = useState(novaChave);
  const [resultado, setResultado] = useState<ResultadoNaTela | null>(null);

  const itens = useMemo(
    () =>
      oferta.ticketTypes
        .filter((tipo) => (quantidades[tipo.id] ?? 0) > 0)
        .map((tipo) => ({ ticketTypeId: tipo.id, quantity: quantidades[tipo.id] ?? 0 })),
    [oferta.ticketTypes, quantidades],
  );
  const digitosDoCpf = cpf.replace(/\D/g, '');
  const entradaDaPrevia = useMemo(
    () => ({
      visitDate: oferta.date,
      items: itens,
      couponCode: cupom,
      manualDiscountCents: desconto ?? 0,
      customerId: cliente?.id ?? null,
      buyerCpf: digitosDoCpf.length === 11 ? digitosDoCpf : null,
    }),
    [oferta.date, itens, cupom, desconto, cliente, digitosDoCpf],
  );
  const chaveDaPrevia = JSON.stringify(entradaDaPrevia);
  const podeCalcular = itens.length > 0 && oferta.day?.status === 'OPEN';

  useEffect(() => {
    if (!podeCalcular) return;
    const controle = new AbortController();
    const espera = setTimeout(() => {
      api<PosQuote>('/api/admin/pos/quote', {
        method: 'POST',
        body: entradaDaPrevia,
        signal: controle.signal,
      })
        .then((dados) => setPrevia({ chave: chaveDaPrevia, dados, erro: null }))
        .catch((falha: unknown) => {
          if (falha instanceof DOMException && falha.name === 'AbortError') return;
          setPrevia({ chave: chaveDaPrevia, dados: null, erro: errorMessage(falha) });
        });
    }, 250);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [podeCalcular, entradaDaPrevia, chaveDaPrevia]);

  const previaAtual = podeCalcular && previa?.chave === chaveDaPrevia ? previa : null;
  const cotacao = previaAtual?.dados ?? null;
  const total = cotacao?.totalCents ?? null;
  const troco = forma === 'CASH' && recebido !== null && total !== null ? recebido - total : null;
  const podeFinalizar = cotacao !== null && !enviando;

  const tiposComVisitantes = oferta.ticketTypes.filter(
    (tipo) => (quantidades[tipo.id] ?? 0) > 0 && holderRequirements(tipo.holderData).name,
  );

  async function carregarOferta(data: DateOnly) {
    setCarregandoData(data);
    try {
      const nova = await api<PosOffer>(`/api/admin/pos/offer?data=${data}`);
      setOferta(nova);
      setQuantidades((atuais) =>
        Object.fromEntries(
          Object.entries(atuais).filter(([id]) => nova.ticketTypes.some((tipo) => tipo.id === id)),
        ),
      );
    } catch (falha) {
      toast.error(errorMessage(falha));
    } finally {
      setCarregandoData(null);
    }
  }

  function escolherData(data: DateOnly) {
    if (data === oferta.date || carregandoData) return;
    setErro(null);
    void carregarOferta(data);
  }

  function selecionarCliente(escolhido: ClienteEncontrado) {
    setCliente(escolhido);
    setNome(escolhido.name);
    setCelular(escolhido.phone ? formatPhoneBR(escolhido.phone) : '');
    setEmail(escolhido.email ?? '');
    setCpf('');
    setCampos({});
  }

  function trocarCliente() {
    setCliente(null);
    setNome('');
    setCelular('');
    setEmail('');
  }

  function mudarVisitante(tipoId: string, indice: number, campo: keyof Visitante, valor: string) {
    setVisitantes((atuais) => {
      const lista = [...(atuais[tipoId] ?? [])];
      lista[indice] = { name: '', cpf: '', birthDate: '', ...lista[indice], [campo]: valor };
      return { ...atuais, [tipoId]: lista };
    });
  }

  function definirRecebido(valor: number) {
    setRecebido(valor);
    setVersaoDosCampos((versao) => versao + 1);
  }

  function aplicarCupom() {
    const codigo = cupomDigitado.trim().toUpperCase();
    if (codigo) setCupom(codigo);
  }

  function removerCupom() {
    setCupom(null);
    setCupomDigitado('');
  }

  function novaVenda() {
    setResultado(null);
    setQuantidades({});
    setCliente(null);
    setNome('');
    setCelular('');
    setEmail('');
    setCpf('');
    setAceitaComunicacoes(false);
    setVisitantes({});
    setCupomDigitado('');
    setCupom(null);
    setDesconto(null);
    setMotivoDoDesconto('');
    setForma('CASH');
    setRecebido(null);
    setVersaoDosCampos((versao) => versao + 1);
    setCampos({});
    setErro(null);
    setChave(novaChave());
    void carregarOferta(oferta.date);
  }

  // Índice de cada visitante na lista enviada, para ligar os erros do servidor ao campo certo.
  const visitantesEnviados = tiposComVisitantes.flatMap((tipo) =>
    Array.from({ length: (quantidades[tipo.id] ?? 0) * tipo.peoplePerTicket }, (_, n) => {
      const visitante = visitantes[tipo.id]?.[n];
      return {
        ticketTypeId: tipo.id,
        name: visitante?.name.trim() || null,
        cpf: visitante?.cpf || null,
        birthDate: visitante?.birthDate || null,
      };
    }),
  );

  async function finalizar() {
    if (!cotacao || enviando) return;
    const faltando: Record<string, string> = {};
    if (nome.trim().length < 3) faltando['buyer.name'] = 'Informe o nome completo do cliente.';
    if ((desconto ?? 0) > 0 && !motivoDoDesconto.trim())
      faltando.discountReason = 'Informe o motivo do desconto.';
    if (Object.keys(faltando).length > 0) {
      setCampos(faltando);
      setErro('Confira os campos destacados.');
      return;
    }

    setEnviando(true);
    setErro(null);
    setCampos({});
    const corpo: PosSaleInput = {
      visitDate: oferta.date,
      items: itens,
      couponCode: cupom,
      manualDiscountCents: desconto ?? 0,
      discountReason: motivoDoDesconto.trim() || null,
      customerId: cliente?.id ?? null,
      buyer: { name: nome, phone: celular || null, email: email || null, cpf: cliente ? null : cpf || null },
      holders: visitantesEnviados,
      paymentMethod: forma,
      cashReceivedCents: forma === 'CASH' ? recebido : null,
      marketingOptIn: aceitaComunicacoes,
      idempotencyKey: chave,
    };
    try {
      const venda = await api<ResultadoNaTela>('/api/admin/pos/sales', { method: 'POST', body: corpo });
      setResultado(venda);
      if (venda.status === 'CONFIRMED') toast.success(`Venda ${venda.code} confirmada.`);
    } catch (falha) {
      if (falha instanceof ApiError) {
        setCampos(falha.fields);
        if (falha.code === 'SOLD_OUT' || falha.code === 'CONFLICT' || falha.code === 'DATE_UNAVAILABLE') {
          void carregarOferta(oferta.date);
        }
      }
      setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <TelaDoResultado
        key={resultado.orderId}
        venda={resultado}
        onNovaVenda={novaVenda}
        canViewOrders={canViewOrders}
        canResend={canResend}
      />
    );
  }

  const dia = oferta.day;
  const ocupados = dia ? dia.sold + dia.held : 0;
  const rotuloDoBotao =
    total === null
      ? 'Finalizar venda'
      : forma === 'PIX' && total > 0
        ? `Gerar PIX de ${formatBRL(total)}`
        : total === 0
          ? 'Emitir ingressos'
          : `Receber ${formatBRL(total)} e emitir`;
  let indiceDoVisitante = 0;

  return (
    <div className="grid items-start gap-6 pb-28 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:pb-0">
      <div className="grid gap-6">
        <Card>
          <CardHeader
            title="Data da visita"
            description={<span className="capitalize-first">{formatDateLong(oferta.date)}</span>}
            action={
              <Input
                type="date"
                min={oferta.today}
                value={oferta.date}
                onChange={(evento) => evento.target.value && escolherData(evento.target.value)}
                aria-label="Escolher outra data"
                className="w-auto"
              />
            }
          />
          <CardContent className="grid gap-4 pt-4">
            {oferta.upcoming.length > 0 ? (
              <div
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                role="group"
                aria-label="Próximos dias abertos"
              >
                {oferta.upcoming.slice(0, 14).map((opcao) => {
                  const ativo = opcao.date === oferta.date;
                  return (
                    <button
                      key={opcao.date}
                      type="button"
                      onClick={() => escolherData(opcao.date)}
                      aria-pressed={ativo}
                      className={cn(
                        'grid min-w-[76px] shrink-0 justify-items-center gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset transition-colors',
                        ativo
                          ? 'bg-pool-700 text-white ring-pool-700'
                          : 'bg-white text-ink-800 ring-ink-200 hover:bg-ink-50',
                      )}
                    >
                      <span
                        className={cn(
                          'text-[11px] font-semibold uppercase',
                          ativo ? 'text-pool-100' : 'text-ink-500',
                        )}
                      >
                        {opcao.date === oferta.today ? 'Hoje' : WEEKDAY_SHORT_LABELS[weekdayOf(opcao.date)]}
                      </span>
                      <span className="tabular text-sm font-semibold">
                        {formatDateBR(opcao.date).slice(0, 5)}
                      </span>
                      <span className={cn('tabular text-[11px]', ativo ? 'text-pool-100' : 'text-ink-500')}>
                        {carregandoData === opcao.date ? (
                          <Spinner className="size-3" />
                        ) : (
                          `${formatNumber(opcao.available ?? 0)} vagas`
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {dia?.status === 'OPEN' && dia.capacity !== null ? (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { rotulo: 'Capacidade', valor: formatNumber(dia.capacity) },
                  { rotulo: 'Vendidos', valor: formatNumber(dia.sold) },
                  { rotulo: 'Disponíveis', valor: formatNumber(dia.available ?? 0) },
                  {
                    rotulo: 'Ocupação',
                    valor: formatPercent(dia.capacity > 0 ? ocupados / dia.capacity : 0),
                  },
                ].map((item) => (
                  <div
                    key={item.rotulo}
                    className="rounded-xl bg-ink-50 px-3 py-2.5 ring-1 ring-inset ring-ink-200/70"
                  >
                    <dt className="text-xs font-medium text-ink-500">{item.rotulo}</dt>
                    <dd className="tabular font-display text-lg font-semibold text-ink-900">{item.valor}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {dia?.status === 'OPEN' && (dia.opensAt || dia.label || dia.held > 0) ? (
              <p className="text-sm text-ink-500">
                {[
                  dia.opensAt && dia.closesAt ? `Aberto das ${dia.opensAt} às ${dia.closesAt}` : null,
                  dia.label,
                  dia.held > 0
                    ? `${plural(dia.held, 'vaga reservada', 'vagas reservadas')} aguardando pagamento`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
            {oferta.blocker ? <Alert tone="warning">{oferta.blocker}</Alert> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Ingressos" description="Preços do dia escolhido, calculados pelo sistema." />
          <CardContent className="pt-2">
            {oferta.ticketTypes.length === 0 ? (
              <p className="py-3 text-sm text-ink-500">Nenhum ingresso à venda no balcão para esta data.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {oferta.ticketTypes.map((tipo) => {
                  const quantidade = quantidades[tipo.id] ?? 0;
                  const detalhe = detalheDoTipo(tipo);
                  return (
                    <li key={tipo.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink-900">{tipo.name}</p>
                        {detalhe ? <p className="text-[13px] text-ink-500">{detalhe}</p> : null}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="tabular font-semibold text-ink-900">{formatBRL(tipo.priceCents)}</p>
                          {tipo.compareAtCents ? (
                            <p className="tabular text-xs text-ink-400 line-through">
                              {formatBRL(tipo.compareAtCents)}
                            </p>
                          ) : tipo.priceLabel ? (
                            <p className="text-xs text-ink-500">{tipo.priceLabel}</p>
                          ) : null}
                        </div>
                        <QuantityStepper
                          value={quantidade}
                          max={limiteDoTipo(tipo)}
                          label={tipo.name}
                          disabled={dia?.available === 0 && quantidade === 0}
                          onChange={(valor) => setQuantidades((atuais) => ({ ...atuais, [tipo.id]: valor }))}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Cliente"
            description="Só o nome é obrigatório. Com CPF ou celular, a venda entra no histórico do cliente."
          />
          <CardContent className="grid gap-4 pt-4">
            {cliente ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-pool-50 px-4 py-3 ring-1 ring-inset ring-pool-100">
                <p className="flex min-w-0 items-center gap-2.5 text-sm text-pool-900">
                  <UserRound className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">
                    Cliente cadastrado: <strong>{cliente.name}</strong>
                    {cliente.cpfMasked ? ` · CPF ${cliente.cpfMasked}` : ''}
                  </span>
                </p>
                <Button variant="ghost" size="sm" onClick={trocarCliente}>
                  <X className="size-4" aria-hidden />
                  Trocar
                </Button>
              </div>
            ) : canSearchCustomers ? (
              <BuscaDeCliente onSelect={selecionarCliente} />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pdv-nome" label="Nome" required error={campos['buyer.name']}>
                <Input
                  id="pdv-nome"
                  value={nome}
                  autoComplete="off"
                  onChange={(evento) => setNome(evento.target.value)}
                  {...fieldIds('pdv-nome', { error: campos['buyer.name'] })}
                />
              </Field>
              <Field id="pdv-celular" label="Celular (WhatsApp)" error={campos['buyer.phone']}>
                <Input
                  id="pdv-celular"
                  value={celular}
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="(73) 99999-8888"
                  onChange={(evento) => setCelular(evento.target.value)}
                  onBlur={() => {
                    const normalizado = normalizePhoneBR(celular);
                    if (normalizado) setCelular(formatPhoneBR(normalizado));
                  }}
                  {...fieldIds('pdv-celular', { error: campos['buyer.phone'] })}
                />
              </Field>
              <Field
                id="pdv-email"
                label="E-mail"
                hint="Para enviar os ingressos por e-mail."
                error={campos['buyer.email']}
              >
                <Input
                  id="pdv-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                  {...fieldIds('pdv-email', { hint: true, error: campos['buyer.email'] })}
                />
              </Field>
              {!cliente ? (
                <Field id="pdv-cpf" label="CPF" error={campos['buyer.cpf']}>
                  <Input
                    id="pdv-cpf"
                    value={cpf}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    onChange={(evento) => setCpf(formatCpfInput(evento.target.value))}
                    {...fieldIds('pdv-cpf', { error: campos['buyer.cpf'] })}
                  />
                </Field>
              ) : null}
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-ink-700">
              <Checkbox
                checked={aceitaComunicacoes}
                onChange={(evento) => setAceitaComunicacoes(evento.target.checked)}
              />
              Aceita receber novidades e promoções do parque
            </label>
          </CardContent>
        </Card>

        {tiposComVisitantes.length > 0 ? (
          <Card>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-5 sm:px-6">
                <span>
                  <span className="block font-display text-[17px] font-semibold text-ink-900">
                    Dados dos visitantes
                  </span>
                  <span className="mt-1 block text-sm text-ink-500">
                    Opcional no balcão. Quando preenchidos, aparecem no ingresso e na portaria.
                  </span>
                </span>
                <Plus
                  className="size-5 shrink-0 text-ink-400 transition-transform group-open:rotate-45"
                  aria-hidden
                />
              </summary>
              <div className="grid gap-5 border-t border-ink-100 px-5 py-5 sm:px-6">
                {tiposComVisitantes.map((tipo) => {
                  const pede = holderRequirements(tipo.holderData);
                  const pessoas = (quantidades[tipo.id] ?? 0) * tipo.peoplePerTicket;
                  return (
                    <fieldset key={tipo.id} className="grid gap-3">
                      <legend className="mb-1 text-sm font-semibold text-ink-800">{tipo.name}</legend>
                      {Array.from({ length: pessoas }, (_, n) => {
                        const indice = indiceDoVisitante++;
                        const visitante = visitantes[tipo.id]?.[n];
                        const base = `pdv-visitante-${tipo.id}-${n}`;
                        return (
                          <div
                            key={base}
                            className={cn('grid gap-3', pede.cpf || pede.birthDate ? 'sm:grid-cols-3' : '')}
                          >
                            <Field
                              id={`${base}-nome`}
                              label={`Visitante ${n + 1}`}
                              error={campos[`holders.${indice}.name`]}
                            >
                              <Input
                                id={`${base}-nome`}
                                value={visitante?.name ?? ''}
                                placeholder="Nome"
                                onChange={(evento) => mudarVisitante(tipo.id, n, 'name', evento.target.value)}
                              />
                            </Field>
                            {pede.cpf ? (
                              <Field id={`${base}-cpf`} label="CPF" error={campos[`holders.${indice}.cpf`]}>
                                <Input
                                  id={`${base}-cpf`}
                                  inputMode="numeric"
                                  value={visitante?.cpf ?? ''}
                                  onChange={(evento) =>
                                    mudarVisitante(tipo.id, n, 'cpf', formatCpfInput(evento.target.value))
                                  }
                                />
                              </Field>
                            ) : null}
                            {pede.birthDate ? (
                              <Field
                                id={`${base}-nascimento`}
                                label="Nascimento"
                                error={campos[`holders.${indice}.birthDate`]}
                              >
                                <Input
                                  id={`${base}-nascimento`}
                                  type="date"
                                  value={visitante?.birthDate ?? ''}
                                  onChange={(evento) =>
                                    mudarVisitante(tipo.id, n, 'birthDate', evento.target.value)
                                  }
                                />
                              </Field>
                            ) : null}
                          </div>
                        );
                      })}
                    </fieldset>
                  );
                })}
              </div>
            </details>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Pagamento" />
          <CardContent className="grid gap-4 pt-4">
            <div
              role="radiogroup"
              aria-label="Forma de pagamento"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {FORMAS.map(({ key, label, icon: Icone }) => {
                const indisponivel = key === 'PIX' && !oferta.pixAvailable;
                const ativo = forma === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    disabled={indisponivel}
                    onClick={() => setForma(key)}
                    className={cn(
                      'flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      ativo
                        ? 'bg-pool-700 text-white ring-pool-700'
                        : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50',
                    )}
                  >
                    <Icone className="size-5" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
            {!oferta.pixAvailable ? (
              <p className="text-[13px] text-ink-500">
                PIX pelo sistema indisponível: configure o provedor de pagamento.
              </p>
            ) : null}

            {forma === 'CASH' ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field
                  id="pdv-recebido"
                  label="Valor recebido"
                  hint="Opcional, para calcular o troco."
                  error={campos.cashReceivedCents}
                >
                  <MoneyInput
                    key={`recebido-${versaoDosCampos}`}
                    id="pdv-recebido"
                    valueCents={recebido}
                    onValueChange={setRecebido}
                    {...fieldIds('pdv-recebido', { hint: true, error: campos.cashReceivedCents })}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {total !== null && total > 0 ? (
                    <Button variant="secondary" size="sm" onClick={() => definirRecebido(total)}>
                      Valor exato
                    </Button>
                  ) : null}
                  {NOTAS.map((nota) => (
                    <Button key={nota} variant="secondary" size="sm" onClick={() => definirRecebido(nota)}>
                      {formatBRL(nota)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {troco !== null ? (
              <p
                className={cn(
                  'rounded-xl px-4 py-3 text-sm font-semibold ring-1 ring-inset',
                  troco >= 0
                    ? 'bg-success-50 text-success-800 ring-success-600/20'
                    : 'bg-danger-50 text-danger-800 ring-danger-600/20',
                )}
              >
                {troco >= 0 ? `Troco: ${formatBRL(troco)}` : `Faltam ${formatBRL(-troco)}`}
              </p>
            ) : null}
            {forma === 'PIX' ? (
              <p className="text-sm text-ink-500">
                O QR Code aparece na próxima tela. Os ingressos são liberados assim que o pagamento cair, e as
                vagas ficam reservadas até lá.
              </p>
            ) : null}
            {forma === 'DEBIT_CARD' || forma === 'CREDIT_CARD' ? (
              <p className="text-sm text-ink-500">
                Passe o cartão na maquininha e finalize depois da aprovação.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:sticky lg:top-24">
        <Card>
          <CardHeader
            title="Resumo"
            description={`Visita em ${formatDateBR(oferta.date)}${dia?.label ? ` · ${dia.label}` : ''}`}
          />
          <CardContent className="grid gap-4 pt-3">
            {itens.length === 0 ? (
              <p className="text-sm text-ink-500">Escolha os ingressos para ver o total.</p>
            ) : cotacao ? (
              <ul className="grid gap-2 text-sm">
                {cotacao.lines.map((linha) => (
                  <li key={linha.ticketTypeId} className="flex items-start justify-between gap-3">
                    <span className="text-ink-700">
                      {linha.quantity} x {linha.name}
                      {linha.people !== linha.quantity ? (
                        <span className="block text-xs text-ink-500">
                          {plural(linha.people, 'pessoa', 'pessoas')}
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular font-medium text-ink-900">{formatBRL(linha.totalCents)}</span>
                  </li>
                ))}
              </ul>
            ) : previaAtual?.erro ? (
              <Alert tone="danger">{previaAtual.erro}</Alert>
            ) : (
              <p className="flex items-center gap-2 text-sm text-ink-500">
                <Spinner className="size-4" />
                Calculando valores
              </p>
            )}

            <div className="grid gap-1.5">
              <div className="flex gap-2">
                <Input
                  value={cupomDigitado}
                  onChange={(evento) => setCupomDigitado(evento.target.value.toUpperCase())}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter') {
                      evento.preventDefault();
                      aplicarCupom();
                    }
                  }}
                  placeholder="Cupom de desconto"
                  aria-label="Código do cupom"
                  disabled={cupom !== null}
                />
                {cupom ? (
                  <Button variant="secondary" onClick={removerCupom}>
                    Remover
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={aplicarCupom} disabled={!cupomDigitado.trim()}>
                    Aplicar
                  </Button>
                )}
              </div>
              {cupom && cotacao?.coupon ? (
                <p className="text-[13px] font-medium text-success-700">
                  Cupom {cotacao.coupon.code}: {cotacao.coupon.summary}
                </p>
              ) : null}
              {cupom && cotacao?.couponError ? (
                <p className="text-[13px] font-medium text-danger-700">{cotacao.couponError}</p>
              ) : null}
            </div>

            {oferta.canDiscount ? (
              <details className="group rounded-xl ring-1 ring-inset ring-ink-200" open={(desconto ?? 0) > 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink-700">
                  Desconto manual
                  <Plus
                    className="size-4 text-ink-400 transition-transform group-open:rotate-45"
                    aria-hidden
                  />
                </summary>
                <div className="grid gap-3 border-t border-ink-100 px-4 py-3">
                  <Field id="pdv-desconto" label="Valor do desconto" error={campos.manualDiscountCents}>
                    <MoneyInput
                      key={`desconto-${versaoDosCampos}`}
                      id="pdv-desconto"
                      valueCents={desconto}
                      onValueChange={setDesconto}
                    />
                  </Field>
                  <Field id="pdv-motivo" label="Motivo" error={campos.discountReason}>
                    <Input
                      id="pdv-motivo"
                      value={motivoDoDesconto}
                      maxLength={200}
                      placeholder="Ex.: aniversariante do dia"
                      onChange={(evento) => setMotivoDoDesconto(evento.target.value)}
                      {...fieldIds('pdv-motivo', { error: campos.discountReason })}
                    />
                  </Field>
                </div>
              </details>
            ) : null}

            {cotacao ? (
              <dl className="grid divide-y divide-ink-100 border-t border-ink-100">
                <div className="flex justify-between py-2 text-sm">
                  <dt className="text-ink-500">Subtotal</dt>
                  <dd className="tabular text-ink-900">{formatBRL(cotacao.subtotalCents)}</dd>
                </div>
                {cotacao.couponDiscountCents > 0 ? (
                  <div className="flex justify-between py-2 text-sm">
                    <dt className="text-ink-500">Cupom</dt>
                    <dd className="tabular text-grape-700">-{formatBRL(cotacao.couponDiscountCents)}</dd>
                  </div>
                ) : null}
                {cotacao.manualDiscountCents > 0 ? (
                  <div className="flex justify-between py-2 text-sm">
                    <dt className="text-ink-500">Desconto manual</dt>
                    <dd className="tabular text-grape-700">-{formatBRL(cotacao.manualDiscountCents)}</dd>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between py-2.5">
                  <dt className="font-semibold text-ink-900">Total</dt>
                  <dd className="tabular font-display text-2xl font-semibold text-ink-950">
                    {formatBRL(cotacao.totalCents)}
                  </dd>
                </div>
              </dl>
            ) : null}
            {cotacao ? (
              <p className="text-[13px] text-ink-500">
                Ocupa {plural(cotacao.people, 'vaga', 'vagas')} de {formatNumber(cotacao.available)}{' '}
                disponíveis.
              </p>
            ) : null}

            {erro ? <Alert tone="danger">{erro}</Alert> : null}
            <div className="hidden lg:block">
              <Button
                size="lg"
                className="w-full"
                onClick={finalizar}
                loading={enviando}
                disabled={!podeFinalizar}
              >
                {rotuloDoBotao}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-500">Total</p>
            <p className="tabular font-display text-xl font-semibold text-ink-950">{formatBRL(total ?? 0)}</p>
          </div>
          <Button size="lg" onClick={finalizar} loading={enviando} disabled={!podeFinalizar}>
            {forma === 'PIX' && (total ?? 0) > 0 ? 'Gerar PIX' : 'Finalizar venda'}
          </Button>
        </div>
      </div>
    </div>
  );
}
