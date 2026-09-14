'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { formatPhoneBR, onlyDigits } from '@/lib/documents';
import { POLICY_LABELS, type ParkProfile, type Policies, type SalesSettings } from '@/lib/settings';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Checkbox, Field, fieldIds, Input, Textarea } from '../../ui/field';

export function Rodape({
  enviando,
  podeSalvar,
  children,
}: {
  enviando: boolean;
  podeSalvar: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse items-stretch gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] text-ink-500">{children}</p>
      {podeSalvar ? (
        <Button type="submit" loading={enviando}>
          Salvar
        </Button>
      ) : (
        <p className="text-[13px] font-medium text-ink-500">Somente leitura para o seu acesso.</p>
      )}
    </div>
  );
}

export function useEnvio<T>(caminho: string, sucesso: string) {
  const router = useRouter();
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(corpo: T) {
    setCampos({});
    setErro(null);
    setEnviando(true);
    try {
      await api(caminho, { method: 'PUT', body: corpo });
      toast.success(sucesso);
      router.refresh();
    } catch (falha) {
      if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) {
        setCampos(falha.fields);
        setErro('Confira os campos destacados.');
      } else {
        setErro(errorMessage(falha));
      }
    } finally {
      setEnviando(false);
    }
  }

  return { campos, erro, enviando, enviar };
}

// ─── Vendas online ──────────────────────────────────────────────────────────

export function SalesSettingsForm({ initial, canManage }: { initial: SalesSettings; canManage: boolean }) {
  const [ativo, setAtivo] = useState(initial.onlineSalesEnabled);
  const [carrinho, setCarrinho] = useState(String(initial.cartHoldMinutes));
  const [pagamento, setPagamento] = useState(String(initial.paymentWindowMinutes));
  const [porPedido, setPorPedido] = useState(String(initial.maxTicketsPerOrder));
  const [antecedencia, setAntecedencia] = useState(String(initial.maxDaysAhead));
  const [limiteHoje, setLimiteHoje] = useState(initial.sameDaySalesUntil ?? '');
  const { campos, erro, enviando, enviar } = useEnvio<SalesSettings>(
    '/api/admin/settings/sales',
    'Regras de venda online salvas.',
  );

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void enviar({
      onlineSalesEnabled: ativo,
      cartHoldMinutes: Number(carrinho),
      paymentWindowMinutes: Number(pagamento),
      maxTicketsPerOrder: Number(porPedido),
      maxDaysAhead: Number(antecedencia),
      sameDaySalesUntil: limiteHoje || null,
    });
  }

  const numero = (valor: string, setter: (valor: string) => void) =>
    setter(valor.replace(/\D/g, '').slice(0, 3));

  return (
    <form onSubmit={salvar} noValidate className="grid gap-5">
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <fieldset disabled={!canManage} className="grid gap-5">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-ink-50 px-4 py-3 ring-1 ring-inset ring-ink-200/70">
          <Checkbox
            checked={ativo}
            onChange={(evento) => setAtivo(evento.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-semibold text-ink-900">Vendas pelo site ligadas</span>
            <span className="block text-ink-500">
              Desligadas, a página de compra continua no ar mas avisa que as vendas estão pausadas.
            </span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="venda-carrinho"
            label="Vagas seguradas durante a compra (minutos)"
            hint="Tempo para preencher os dados sem perder a vaga. De 5 a 30."
            error={campos.cartHoldMinutes}
          >
            <Input
              id="venda-carrinho"
              inputMode="numeric"
              value={carrinho}
              onChange={(evento) => numero(evento.target.value, setCarrinho)}
              {...fieldIds('venda-carrinho', { hint: true, error: campos.cartHoldMinutes })}
            />
          </Field>
          <Field
            id="venda-pagamento"
            label="Prazo para pagar o PIX (minutos)"
            hint="Depois disso o pedido vence e as vagas voltam. De 10 a 120."
            error={campos.paymentWindowMinutes}
          >
            <Input
              id="venda-pagamento"
              inputMode="numeric"
              value={pagamento}
              onChange={(evento) => numero(evento.target.value, setPagamento)}
              {...fieldIds('venda-pagamento', { hint: true, error: campos.paymentWindowMinutes })}
            />
          </Field>
          <Field
            id="venda-por-pedido"
            label="Ingressos por pedido"
            hint="Máximo de ingressos em uma compra. De 1 a 100."
            error={campos.maxTicketsPerOrder}
          >
            <Input
              id="venda-por-pedido"
              inputMode="numeric"
              value={porPedido}
              onChange={(evento) => numero(evento.target.value, setPorPedido)}
              {...fieldIds('venda-por-pedido', { hint: true, error: campos.maxTicketsPerOrder })}
            />
          </Field>
          <Field
            id="venda-antecedencia"
            label="Antecedência máxima (dias)"
            hint="Até quantos dias à frente o site vende. De 1 a 365."
            error={campos.maxDaysAhead}
          >
            <Input
              id="venda-antecedencia"
              inputMode="numeric"
              value={antecedencia}
              onChange={(evento) => numero(evento.target.value, setAntecedencia)}
              {...fieldIds('venda-antecedencia', { hint: true, error: campos.maxDaysAhead })}
            />
          </Field>
          <Field
            id="venda-hoje"
            label="Vender para o mesmo dia até"
            hint="Em branco: vende até o parque fechar."
            error={campos.sameDaySalesUntil}
          >
            <Input
              id="venda-hoje"
              type="time"
              value={limiteHoje}
              onChange={(evento) => setLimiteHoje(evento.target.value)}
              {...fieldIds('venda-hoje', { hint: true, error: campos.sameDaySalesUntil })}
            />
          </Field>
        </div>
      </fieldset>
      <Rodape enviando={enviando} podeSalvar={canManage}>
        Vale para as próximas compras. Pedidos já feitos mantêm o prazo que tinham.
      </Rodape>
    </form>
  );
}

// ─── Dados do parque ────────────────────────────────────────────────────────

function mascaraCnpj(valor: string): string {
  const d = onlyDigits(valor).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function mascaraCep(valor: string): string {
  const d = onlyDigits(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function ParkProfileForm({ initial, canManage }: { initial: ParkProfile; canManage: boolean }) {
  const [valores, setValores] = useState({
    name: initial.name,
    legalName: initial.legalName ?? '',
    cnpj: initial.cnpj ? mascaraCnpj(initial.cnpj) : '',
    email: initial.email ?? '',
    phone: initial.phone ? formatPhoneBR(initial.phone) : '',
    whatsapp: initial.whatsapp ? formatPhoneBR(initial.whatsapp) : '',
    addressLine: initial.addressLine ?? '',
    city: initial.city ?? '',
    state: initial.state ?? '',
    postalCode: initial.postalCode ? mascaraCep(initial.postalCode) : '',
    orderCodePrefix: initial.orderCodePrefix,
  });
  const { campos, erro, enviando, enviar } = useEnvio<Record<string, string | null>>(
    '/api/admin/settings/park',
    'Dados do parque salvos.',
  );

  const alterar = (campo: keyof typeof valores) => (valor: string) =>
    setValores((atual) => ({ ...atual, [campo]: valor }));

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void enviar({
      name: valores.name,
      legalName: valores.legalName || null,
      cnpj: valores.cnpj || null,
      email: valores.email || null,
      phone: valores.phone || null,
      whatsapp: valores.whatsapp || null,
      addressLine: valores.addressLine || null,
      city: valores.city || null,
      state: valores.state || null,
      postalCode: valores.postalCode || null,
      orderCodePrefix: valores.orderCodePrefix,
    });
  }

  const campo = (
    id: keyof typeof valores,
    label: string,
    opcoes: {
      hint?: string;
      required?: boolean;
      className?: string;
      inputMode?: 'numeric' | 'email' | 'tel';
      mascara?: (valor: string) => string;
      maxLength?: number;
    } = {},
  ) => (
    <Field
      id={`parque-${id}`}
      label={label}
      hint={opcoes.hint}
      required={opcoes.required}
      error={campos[id]}
      className={opcoes.className}
    >
      <Input
        id={`parque-${id}`}
        inputMode={opcoes.inputMode}
        maxLength={opcoes.maxLength}
        value={valores[id]}
        onChange={(evento) =>
          alterar(id)(opcoes.mascara ? opcoes.mascara(evento.target.value) : evento.target.value)
        }
        {...fieldIds(`parque-${id}`, { hint: opcoes.hint, error: campos[id] })}
      />
    </Field>
  );

  return (
    <form onSubmit={salvar} noValidate className="grid gap-5">
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-2">
        {campo('name', 'Nome do parque', {
          required: true,
          hint: 'Aparece no site, nos e-mails e nos ingressos.',
        })}
        {campo('legalName', 'Razão social', { hint: 'Aparece nas políticas e no rodapé do site.' })}
        {campo('cnpj', 'CNPJ', { inputMode: 'numeric', mascara: mascaraCnpj })}
        {campo('email', 'E-mail de atendimento', { inputMode: 'email' })}
        {campo('phone', 'Telefone', { inputMode: 'tel' })}
        {campo('whatsapp', 'WhatsApp de atendimento', {
          inputMode: 'tel',
          hint: 'Botão de contato no site.',
        })}
        {campo('addressLine', 'Endereço', { className: 'sm:col-span-2', hint: 'Rua, número e referência.' })}
        {campo('city', 'Cidade')}
        <div className="grid grid-cols-2 gap-4">
          {campo('state', 'UF', {
            maxLength: 2,
            mascara: (valor) => valor.toUpperCase().replace(/[^A-Z]/g, ''),
          })}
          {campo('postalCode', 'CEP', { inputMode: 'numeric', mascara: mascaraCep })}
        </div>
        {campo('orderCodePrefix', 'Prefixo do número do pedido', {
          maxLength: 6,
          mascara: (valor) => valor.toUpperCase().replace(/[^A-Z]/g, ''),
          hint: 'Ex.: CP gera pedidos CP-2026-000123. Mudar não altera pedidos antigos.',
        })}
      </fieldset>
      <Rodape enviando={enviando} podeSalvar={canManage} />
    </form>
  );
}

// ─── Políticas ──────────────────────────────────────────────────────────────

const ENDERECOS: Record<keyof Policies, string> = {
  cancellation: '/politicas/cancelamento',
  terms: '/politicas/termos',
  privacy: '/politicas/privacidade',
};

export function PoliciesForm({ initial, canManage }: { initial: Policies; canManage: boolean }) {
  const [valores, setValores] = useState<Policies>(initial);
  const { campos, erro, enviando, enviar } = useEnvio<Policies>(
    '/api/admin/settings/policies',
    'Políticas salvas e publicadas no site.',
  );

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void enviar(valores);
  }

  return (
    <form onSubmit={salvar} noValidate className="grid gap-5">
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <fieldset disabled={!canManage} className="grid gap-5">
        {(Object.keys(POLICY_LABELS) as (keyof Policies)[]).map((chave) => (
          <Field
            key={chave}
            id={`politica-${chave}`}
            label={POLICY_LABELS[chave]}
            hint={
              <>
                Publicada em{' '}
                <a
                  href={ENDERECOS[chave]}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-pool-700 hover:text-pool-800"
                >
                  {ENDERECOS[chave]}
                </a>
                . O cliente aceita na compra.
              </>
            }
            error={campos[chave]}
          >
            <Textarea
              id={`politica-${chave}`}
              value={valores[chave]}
              rows={10}
              className="min-h-56 font-sans leading-6"
              onChange={(evento) => setValores((atual) => ({ ...atual, [chave]: evento.target.value }))}
              {...fieldIds(`politica-${chave}`, { hint: true, error: campos[chave] })}
            />
          </Field>
        ))}
      </fieldset>
      <Rodape enviando={enviando} podeSalvar={canManage}>
        Textos iniciais são um modelo: revise com a assessoria jurídica do parque.
      </Rodape>
    </form>
  );
}
