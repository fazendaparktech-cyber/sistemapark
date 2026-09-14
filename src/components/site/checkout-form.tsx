'use client';

import { Clock, LockKeyhole, TicketPercent, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { formatCpfInput } from '@/lib/documents';
import { formatBRL } from '@/lib/money';
import {
  readAttribution,
  rememberPendingPurchase,
  sendFunnelEvent,
  trackPixel,
  visitorId,
  whenPixelsReady,
} from '@/lib/tracking-client';
import { formatDateLong } from '@/lib/weekdays';

import { Alert } from '../ui/alert';
import { Button, buttonClasses } from '../ui/button';
import { Checkbox, Field, fieldIds, Input } from '../ui/field';
import { formatSeconds, useSecondsLeft } from './countdown';

export interface CheckoutCartItem {
  ticketTypeId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  tickets: number;
  holder: { name: boolean; cpf: boolean; birthDate: boolean };
  minAge: number | null;
  maxAge: number | null;
  documentHint: string | null;
  available: boolean;
}

export interface CheckoutCart {
  date: string;
  expiresAt: string;
  opensAt: string | null;
  closesAt: string | null;
  items: CheckoutCartItem[];
  subtotalCents: number;
  ticketsCount: number;
}

interface Visitante {
  ticketTypeId: string;
  typeName: string;
  numero: number;
  pedeCpf: boolean;
  pedeNascimento: boolean;
  faixa: string | null;
  name: string;
  birthDate: string;
  cpf: string;
}

function formatarCelular(valor: string): string {
  const d = valor
    .replace(/\D/g, '')
    .replace(/^55(?=\d{10,11}$)/, '')
    .slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function faixaEtaria(item: CheckoutCartItem): string | null {
  if (item.minAge !== null && item.maxAge !== null) return `de ${item.minAge} a ${item.maxAge} anos`;
  if (item.maxAge !== null) return `até ${item.maxAge} anos`;
  if (item.minAge !== null && item.minAge > 0) return `a partir de ${item.minAge} anos`;
  return null;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function CheckoutForm({ cart }: { cart: CheckoutCart }) {
  const router = useRouter();
  const segundos = useSecondsLeft(cart.expiresAt);
  const expirou = segundos === 0;

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [celular, setCelular] = useState('');
  const [cpf, setCpf] = useState('');
  const [visitantes, setVisitantes] = useState<Visitante[]>(() =>
    cart.items.flatMap((item) =>
      item.holder.name
        ? Array.from({ length: item.tickets }, (_, indice) => ({
            ticketTypeId: item.ticketTypeId,
            typeName: item.name,
            numero: indice + 1,
            pedeCpf: item.holder.cpf,
            pedeNascimento: item.holder.birthDate,
            faixa: faixaEtaria(item),
            name: '',
            birthDate: '',
            cpf: '',
          }))
        : [],
    ),
  );
  const [souVisitante, setSouVisitante] = useState(false);
  const [codigoDoCupom, setCodigoDoCupom] = useState('');
  const [cupom, setCupom] = useState<{
    code: string;
    summary: string;
    discountCents: number;
    totalCents: number;
  } | null>(null);
  const [erroDoCupom, setErroDoCupom] = useState<string | null>(null);
  const [aplicandoCupom, setAplicandoCupom] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [novidades, setNovidades] = useState(false);
  const [chave] = useState(() => crypto.randomUUID());
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [expirado, setExpirado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const primeiroAdulto = visitantes.findIndex((visitante) => !visitante.pedeNascimento);
  const total = cupom ? cupom.totalCents : cart.subtotalCents;

  useEffect(() => {
    sendFunnelEvent('CHECKOUT_STARTED', cart.subtotalCents);
    return whenPixelsReady(() =>
      trackPixel('InitiateCheckout', { valueCents: cart.subtotalCents, quantity: cart.ticketsCount }),
    );
  }, [cart.subtotalCents, cart.ticketsCount]);

  function alterarVisitante(indice: number, campo: 'name' | 'birthDate' | 'cpf', valor: string) {
    setVisitantes((atuais) =>
      atuais.map((visitante, i) => (i === indice ? { ...visitante, [campo]: valor } : visitante)),
    );
  }

  function usarMeuNome(marcado: boolean) {
    setSouVisitante(marcado);
    if (primeiroAdulto >= 0) alterarVisitante(primeiroAdulto, 'name', marcado ? nome : '');
  }

  async function aplicarCupom() {
    if (!codigoDoCupom.trim()) return;
    setAplicandoCupom(true);
    setErroDoCupom(null);
    try {
      const resultado = await api<{
        code: string;
        summary: string;
        discountCents: number;
        totalCents: number;
      }>('/api/public/cart/coupon', { method: 'POST', body: { code: codigoDoCupom, cpf: cpf || null } });
      setCupom(resultado);
    } catch (falha) {
      setCupom(null);
      if (falha instanceof ApiError && (falha.code === 'CART_EXPIRED' || falha.code === 'CART_NOT_FOUND'))
        setExpirado(true);
      else setErroDoCupom(errorMessage(falha));
    } finally {
      setAplicandoCupom(false);
    }
  }

  async function concluir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const faltando: Record<string, string> = {};
    if (nome.trim().length < 3) faltando['buyer.name'] = 'Informe seu nome completo.';
    if (!email.includes('@')) faltando['buyer.email'] = 'Informe um e-mail válido.';
    if (celular.replace(/\D/g, '').length < 10) faltando['buyer.phone'] = 'Informe o celular com DDD.';
    if (cpf.replace(/\D/g, '').length !== 11) faltando['buyer.cpf'] = 'Informe o CPF.';
    visitantes.forEach((visitante, indice) => {
      if (visitante.name.trim().length < 3) faltando[`holders.${indice}.name`] = 'Informe o nome completo.';
      if (visitante.pedeNascimento && !visitante.birthDate)
        faltando[`holders.${indice}.birthDate`] = 'Informe a data de nascimento.';
      if (visitante.pedeCpf && visitante.cpf.replace(/\D/g, '').length !== 11)
        faltando[`holders.${indice}.cpf`] = 'Informe o CPF.';
    });
    if (!aceite)
      faltando.acceptTerms = 'Para continuar, aceite os termos de compra e a política de cancelamento.';
    setCampos(faltando);
    if (Object.keys(faltando).length > 0) {
      setErro('Confira os campos destacados.');
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    setEnviando(true);
    try {
      const resultado = await api<{ url: string; code: string; totalCents: number }>('/api/public/checkout', {
        method: 'POST',
        body: {
          buyer: { name: nome, email, phone: celular, cpf },
          holders: visitantes.map((visitante) => ({
            ticketTypeId: visitante.ticketTypeId,
            name: visitante.name,
            birthDate: visitante.birthDate || null,
            cpf: visitante.cpf || null,
          })),
          couponCode: cupom?.code ?? null,
          marketingOptIn: novidades,
          acceptTerms: aceite,
          idempotencyKey: chave,
          attribution: readAttribution(),
          visitorId: visitorId(),
        },
      });
      if (resultado.totalCents > 0) {
        trackPixel('AddPaymentInfo', { valueCents: resultado.totalCents, quantity: cart.ticketsCount });
      }
      rememberPendingPurchase(resultado.code);
      router.replace(resultado.url);
    } catch (falha) {
      setEnviando(false);
      if (falha instanceof ApiError) {
        if (falha.code === 'CART_EXPIRED' || falha.code === 'CART_NOT_FOUND') {
          setExpirado(true);
          return;
        }
        if (falha.code === 'COUPON_INVALID') {
          setCupom(null);
          setErroDoCupom(falha.message);
          setErro('O cupom não pôde ser aplicado. Remova ou troque o cupom para continuar.');
          return;
        }
        if (Object.keys(falha.fields).length > 0) {
          setCampos(falha.fields);
          setErro(falha.message);
          requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
          return;
        }
      }
      setErro(errorMessage(falha));
    }
  }

  async function alterarIngressos() {
    await api('/api/public/cart', { method: 'DELETE' }).catch(() => undefined);
    router.push(`/comprar?data=${cart.date}`);
  }

  if (expirado || expirou) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-card ring-1 ring-ink-200/70">
        <Clock className="mx-auto size-10 text-sun-600" aria-hidden />
        <h2 className="mt-4 font-display text-2xl font-semibold text-ink-900">O tempo da reserva acabou</h2>
        <p className="mt-2 text-ink-600">
          As vagas ficam seguradas por alguns minutos enquanto você preenche os dados. Escolha os ingressos de
          novo para continuar.
        </p>
        <Link href={`/comprar?data=${cart.date}`} className={buttonClasses('cta', 'lg', 'mt-6')}>
          Escolher ingressos de novo
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={concluir}
      noValidate
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8"
    >
      <div className="grid gap-6">
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl bg-sun-50 px-4 py-3 text-sm text-sun-800 ring-1 ring-inset ring-sun-200"
        >
          <Clock className="size-5 shrink-0" aria-hidden />
          <p>
            Suas vagas estão reservadas por{' '}
            <span className="tabular font-semibold">
              {segundos === null ? '--:--' : formatSeconds(segundos)}
            </span>
            . Conclua a compra dentro desse prazo.
          </p>
        </div>

        {erro ? <Alert tone="danger">{erro}</Alert> : null}

        <section className="grid gap-4 rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 sm:p-6">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Seus dados</h2>
            <p className="mt-1 text-sm text-ink-500">Os ingressos e o comprovante chegam neste e-mail.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="comprador-nome"
              label="Nome completo"
              required
              error={campos['buyer.name']}
              className="sm:col-span-2"
            >
              <Input
                id="comprador-nome"
                autoComplete="name"
                value={nome}
                onChange={(evento) => {
                  setNome(evento.target.value);
                  if (souVisitante && primeiroAdulto >= 0)
                    alterarVisitante(primeiroAdulto, 'name', evento.target.value);
                }}
                {...fieldIds('comprador-nome', { error: campos['buyer.name'] })}
              />
            </Field>
            <Field id="comprador-email" label="E-mail" required error={campos['buyer.email']}>
              <Input
                id="comprador-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                {...fieldIds('comprador-email', { error: campos['buyer.email'] })}
              />
            </Field>
            <Field id="comprador-celular" label="Celular com DDD" required error={campos['buyer.phone']}>
              <Input
                id="comprador-celular"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(73) 99999-8888"
                value={celular}
                onChange={(evento) => setCelular(formatarCelular(evento.target.value))}
                {...fieldIds('comprador-celular', { error: campos['buyer.phone'] })}
              />
            </Field>
            <Field
              id="comprador-cpf"
              label="CPF"
              required
              hint="Usado para emitir a cobrança PIX e localizar suas compras."
              error={campos['buyer.cpf']}
            >
              <Input
                id="comprador-cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(evento) => setCpf(formatCpfInput(evento.target.value))}
                {...fieldIds('comprador-cpf', { hint: true, error: campos['buyer.cpf'] })}
              />
            </Field>
          </div>
        </section>

        {visitantes.length > 0 ? (
          <section className="grid gap-4 rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 sm:p-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">Quem vai usar os ingressos</h2>
              <p className="mt-1 text-sm text-ink-500">
                O nome aparece no ingresso e é conferido na entrada junto com o QR Code.
              </p>
            </div>
            {primeiroAdulto >= 0 ? (
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-800">
                <Checkbox checked={souVisitante} onChange={(evento) => usarMeuNome(evento.target.checked)} />
                Eu também vou ao parque (usar meu nome no primeiro ingresso)
              </label>
            ) : null}
            <ol className="grid gap-4">
              {visitantes.map((visitante, indice) => (
                <li
                  key={`${visitante.ticketTypeId}-${visitante.numero}`}
                  className="rounded-2xl p-4 ring-1 ring-inset ring-ink-200"
                >
                  <p className="text-sm font-semibold text-ink-900">
                    {visitante.typeName} {visitante.numero}
                    {visitante.faixa ? (
                      <span className="font-normal text-ink-500"> · {visitante.faixa}</span>
                    ) : null}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field
                      id={`visitante-${indice}-nome`}
                      label="Nome completo"
                      required
                      error={campos[`holders.${indice}.name`]}
                      className={visitante.pedeNascimento || visitante.pedeCpf ? undefined : 'sm:col-span-2'}
                    >
                      <Input
                        id={`visitante-${indice}-nome`}
                        value={visitante.name}
                        onChange={(evento) => alterarVisitante(indice, 'name', evento.target.value)}
                        {...fieldIds(`visitante-${indice}-nome`, { error: campos[`holders.${indice}.name`] })}
                      />
                    </Field>
                    {visitante.pedeNascimento ? (
                      <Field
                        id={`visitante-${indice}-nascimento`}
                        label="Data de nascimento"
                        required
                        error={campos[`holders.${indice}.birthDate`]}
                      >
                        <Input
                          id={`visitante-${indice}-nascimento`}
                          type="date"
                          max={cart.date}
                          value={visitante.birthDate}
                          onChange={(evento) => alterarVisitante(indice, 'birthDate', evento.target.value)}
                          {...fieldIds(`visitante-${indice}-nascimento`, {
                            error: campos[`holders.${indice}.birthDate`],
                          })}
                        />
                      </Field>
                    ) : null}
                    {visitante.pedeCpf ? (
                      <Field
                        id={`visitante-${indice}-cpf`}
                        label="CPF"
                        required
                        error={campos[`holders.${indice}.cpf`]}
                      >
                        <Input
                          id={`visitante-${indice}-cpf`}
                          inputMode="numeric"
                          value={visitante.cpf}
                          onChange={(evento) =>
                            alterarVisitante(indice, 'cpf', formatCpfInput(evento.target.value))
                          }
                          {...fieldIds(`visitante-${indice}-cpf`, { error: campos[`holders.${indice}.cpf`] })}
                        />
                      </Field>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <aside className="grid gap-4 lg:sticky lg:top-24">
        <div className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">Sua compra</h2>
              <p className="mt-1 text-sm text-ink-600">{capitalizar(formatDateLong(cart.date))}</p>
              {cart.opensAt && cart.closesAt ? (
                <p className="text-xs text-ink-500">
                  Das {cart.opensAt} às {cart.closesAt}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void alterarIngressos()}
              className="text-sm font-semibold text-pool-700 hover:text-pool-800"
            >
              Alterar
            </button>
          </div>
          <ul className="mt-4 grid gap-2 text-sm">
            {cart.items.map((item) => (
              <li key={item.ticketTypeId} className="flex justify-between gap-3">
                <span className="text-ink-700">
                  {item.quantity} × {item.name}
                </span>
                <span className="tabular font-medium text-ink-900">{formatBRL(item.totalCents)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-ink-100 pt-4">
            {cupom ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-grape-50 px-3 py-2 text-sm text-grape-800 ring-1 ring-inset ring-grape-200">
                <span className="flex items-center gap-2">
                  <TicketPercent className="size-4" aria-hidden />
                  <span>
                    <span className="font-mono font-semibold">{cupom.code}</span> · {cupom.summary}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCupom(null);
                    setCodigoDoCupom('');
                  }}
                  className="grid size-7 place-items-center rounded-lg hover:bg-grape-100"
                  aria-label="Remover cupom"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <label htmlFor="cupom" className="text-[13px] font-semibold text-ink-800">
                  Cupom de desconto
                </label>
                <div className="flex gap-2">
                  <Input
                    id="cupom"
                    value={codigoDoCupom}
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="font-mono uppercase"
                    onChange={(evento) => {
                      setCodigoDoCupom(evento.target.value.toUpperCase().replace(/\s/g, ''));
                      setErroDoCupom(null);
                    }}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') {
                        evento.preventDefault();
                        void aplicarCupom();
                      }
                    }}
                    aria-invalid={erroDoCupom ? true : undefined}
                    aria-describedby={erroDoCupom ? 'cupom-erro' : undefined}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => void aplicarCupom()}
                    loading={aplicandoCupom}
                    disabled={!codigoDoCupom}
                  >
                    Aplicar
                  </Button>
                </div>
                {erroDoCupom ? (
                  <p id="cupom-erro" className="text-[13px] font-medium text-danger-700">
                    {erroDoCupom}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <dl className="mt-4 grid gap-1.5 border-t border-ink-100 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Subtotal</dt>
              <dd className="tabular text-ink-900">{formatBRL(cart.subtotalCents)}</dd>
            </div>
            {cupom ? (
              <div className="flex justify-between">
                <dt className="text-ink-500">Desconto</dt>
                <dd className="tabular text-grape-700">-{formatBRL(cupom.discountCents)}</dd>
              </div>
            ) : null}
            <div className="flex items-end justify-between pt-1">
              <dt className="font-semibold text-ink-900">Total</dt>
              <dd className="tabular font-display text-2xl font-semibold text-ink-900">{formatBRL(total)}</dd>
            </div>
          </dl>

          <div className="mt-5 grid gap-3 text-sm text-ink-700">
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={aceite}
                onChange={(evento) => setAceite(evento.target.checked)}
                className="mt-0.5"
                aria-invalid={campos.acceptTerms ? true : undefined}
                aria-describedby={campos.acceptTerms ? 'aceite-erro' : undefined}
              />
              <span>
                Li e aceito os{' '}
                <a
                  href="/politicas/termos"
                  target="_blank"
                  className="font-semibold text-pool-700 underline-offset-2 hover:underline"
                >
                  termos de compra
                </a>{' '}
                e a{' '}
                <a
                  href="/politicas/cancelamento"
                  target="_blank"
                  className="font-semibold text-pool-700 underline-offset-2 hover:underline"
                >
                  política de cancelamento
                </a>
                .
              </span>
            </label>
            {campos.acceptTerms ? (
              <p id="aceite-erro" className="-mt-1 text-[13px] font-medium text-danger-700">
                {campos.acceptTerms}
              </p>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={novidades}
                onChange={(evento) => setNovidades(evento.target.checked)}
                className="mt-0.5"
              />
              <span>Quero receber novidades e promoções do parque.</span>
            </label>
          </div>

          <Button type="submit" variant="cta" size="lg" className="mt-5 w-full" loading={enviando}>
            {total === 0 ? 'Confirmar pedido' : `Pagar ${formatBRL(total)} com PIX`}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-500">
            <LockKeyhole className="size-3.5" aria-hidden />
            Seus dados são protegidos. O CPF não fica salvo por completo.
          </p>
        </div>
      </aside>
    </form>
  );
}
