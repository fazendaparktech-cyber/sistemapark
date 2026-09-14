'use client';

import { CalendarDays, ChevronLeft, ChevronRight, ShieldCheck, Ticket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { addDays, weekdayOf } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { formatDateLong, formatMonthYear, WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';
import type { PublicCalendarDay, PublicDateOffer, PublicTicketOffer } from '@/server/sales/availability';

import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { Skeleton } from '../ui/feedback';
import { QuantityStepper } from './quantity-stepper';

export const ATTRIBUTION_KEY = 'cp-origem';

function deslocarMes(mes: string, delta: number): string {
  const [ano = 2026, numero = 1] = mes.split('-').map(Number);
  const data = new Date(Date.UTC(ano, numero - 1 + delta, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

function precoCurto(cents: number): string {
  return cents % 100 === 0 ? `R$ ${cents / 100}` : formatBRL(cents);
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function limiteDoTipo(tipo: PublicTicketOffer, oferta: PublicDateOffer): number {
  const porPedido = Math.floor(oferta.maxTicketsPerOrder / tipo.peoplePerTicket);
  return Math.max(0, Math.min(tipo.maxPerOrder ?? porPedido, tipo.remainingUnits ?? porPedido, porPedido));
}

/** Guarda de onde a pessoa veio (campanha), para o pedido registrar a origem. */
function lembrarOrigem() {
  try {
    if (sessionStorage.getItem(ATTRIBUTION_KEY)) return;
    const url = new URL(window.location.href);
    const referrer =
      document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : null;
    const origem = {
      utmSource: url.searchParams.get('utm_source'),
      utmMedium: url.searchParams.get('utm_medium'),
      utmCampaign: url.searchParams.get('utm_campaign'),
      utmContent: url.searchParams.get('utm_content'),
      utmTerm: url.searchParams.get('utm_term'),
      referrer,
    };
    if (Object.values(origem).some(Boolean)) sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(origem));
  } catch {
    // Navegação privada pode bloquear o armazenamento: a compra segue sem a origem.
  }
}

export function PurchaseFlow({
  today,
  maxDaysAhead,
  initialDate,
  initialTicketTypeId,
  notice,
}: {
  today: string;
  maxDaysAhead: number;
  initialDate: string | null;
  initialTicketTypeId: string | null;
  notice: string | null;
}) {
  const router = useRouter();
  const ultimoDia = addDays(today, maxDaysAhead);
  const [mes, setMes] = useState((initialDate ?? today).slice(0, 7));
  const [calendario, setCalendario] = useState<{ mes: string; dias: PublicCalendarDay[] } | null>(null);
  const [erroDoCalendario, setErroDoCalendario] = useState<string | null>(null);
  const [data, setData] = useState<string | null>(initialDate);
  const [oferta, setOferta] = useState<PublicDateOffer | null>(null);
  const [carregandoOferta, setCarregandoOferta] = useState(Boolean(initialDate));
  const [recarga, setRecarga] = useState(0);
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [erro, setErro] = useState<string | null>(notice);
  const [enviando, setEnviando] = useState(false);
  const secaoDeIngressos = useRef<HTMLDivElement>(null);
  const preSelecionou = useRef(false);
  const rolarAoCarregar = useRef(false);

  useEffect(lembrarOrigem, []);

  useEffect(() => {
    const controle = new AbortController();
    const inicioDoMes = `${mes}-01`;
    const fimDoMes = addDays(`${deslocarMes(mes, 1)}-01`, -1);
    const de = inicioDoMes < today ? today : inicioDoMes;
    const ate = fimDoMes > ultimoDia ? ultimoDia : fimDoMes;
    const carregar =
      de > ate
        ? Promise.resolve([] as PublicCalendarDay[])
        : api<PublicCalendarDay[]>(`/api/public/calendar?de=${de}&ate=${ate}`, { signal: controle.signal });
    carregar
      .then((dias) => {
        setErroDoCalendario(null);
        setCalendario({ mes, dias });
      })
      .catch((falha: unknown) => {
        if (falha instanceof DOMException && falha.name === 'AbortError') return;
        setErroDoCalendario(errorMessage(falha));
      });
    return () => controle.abort();
  }, [mes, today, ultimoDia]);

  // Ingressos e preços da data escolhida. O estado só muda quando a resposta chega.
  useEffect(() => {
    if (!data) return;
    const controle = new AbortController();
    api<PublicDateOffer>(`/api/public/offer?data=${data}`, { signal: controle.signal })
      .then((resposta) => {
        setOferta(resposta);
        setQuantidades((atuais) => {
          const novas: Record<string, number> = {};
          for (const tipo of resposta.ticketTypes) {
            novas[tipo.id] = Math.min(atuais[tipo.id] ?? 0, limiteDoTipo(tipo, resposta));
          }
          const tipoInicial = resposta.ticketTypes.find((tipo) => tipo.id === initialTicketTypeId);
          if (!preSelecionou.current && tipoInicial && limiteDoTipo(tipoInicial, resposta) > 0) {
            novas[tipoInicial.id] = Math.max(1, tipoInicial.minPerOrder ?? 1);
            preSelecionou.current = true;
          }
          return novas;
        });
        setCarregandoOferta(false);
        if (rolarAoCarregar.current && window.matchMedia('(max-width: 1023px)').matches) {
          requestAnimationFrame(() =>
            secaoDeIngressos.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          );
        }
        rolarAoCarregar.current = false;
      })
      .catch((falha: unknown) => {
        if (falha instanceof DOMException && falha.name === 'AbortError') return;
        setOferta(null);
        setErro(errorMessage(falha));
        setCarregandoOferta(false);
      });
    return () => controle.abort();
  }, [data, recarga, initialTicketTypeId]);

  function escolherData(novaData: string) {
    rolarAoCarregar.current = true;
    setErro(null);
    setCarregandoOferta(true);
    if (novaData === data) setRecarga((atual) => atual + 1);
    else setData(novaData);
  }

  const tipos = oferta?.ticketTypes ?? [];
  const escolhidos = tipos.filter((tipo) => (quantidades[tipo.id] ?? 0) > 0);
  const totalDeIngressos = escolhidos.reduce(
    (soma, tipo) => soma + (quantidades[tipo.id] ?? 0) * tipo.peoplePerTicket,
    0,
  );
  const pessoasComVaga = escolhidos.reduce(
    (soma, tipo) => soma + (tipo.occupiesCapacity ? (quantidades[tipo.id] ?? 0) * tipo.peoplePerTicket : 0),
    0,
  );
  const subtotal = escolhidos.reduce((soma, tipo) => soma + (quantidades[tipo.id] ?? 0) * tipo.priceCents, 0);
  const passouDoLimite = oferta ? totalDeIngressos > oferta.maxTicketsPerOrder : false;
  const semVagas =
    oferta?.available !== null && oferta?.available !== undefined && pessoasComVaga > oferta.available;
  const abaixoDoMinimo = escolhidos.find(
    (tipo) => tipo.minPerOrder !== null && (quantidades[tipo.id] ?? 0) < tipo.minPerOrder,
  );
  const podeContinuar = Boolean(
    data &&
    oferta &&
    !oferta.blocker &&
    totalDeIngressos > 0 &&
    !passouDoLimite &&
    !semVagas &&
    !abaixoDoMinimo,
  );

  async function continuar() {
    if (!data || !podeContinuar) return;
    setEnviando(true);
    setErro(null);
    try {
      await api('/api/public/cart', {
        method: 'POST',
        body: {
          date: data,
          items: escolhidos.map((tipo) => ({ ticketTypeId: tipo.id, quantity: quantidades[tipo.id] ?? 0 })),
        },
      });
      router.push('/comprar/dados');
    } catch (falha) {
      setErro(errorMessage(falha));
      setEnviando(false);
      if (
        falha instanceof ApiError &&
        ['SOLD_OUT', 'CONFLICT', 'DATE_UNAVAILABLE', 'LIMIT_EXCEEDED'].includes(falha.code)
      ) {
        setRecarga((atual) => atual + 1);
      }
    }
  }

  const diasDoMes = calendario?.mes === mes ? calendario.dias : null;
  const porData = new Map((diasDoMes ?? []).map((dia) => [dia.date, dia]));
  const totalDeDias = Number(addDays(`${deslocarMes(mes, 1)}-01`, -1).slice(8));
  const vazios = weekdayOf(`${mes}-01`);
  const podeVoltar = mes > today.slice(0, 7);
  const podeAvancar = deslocarMes(mes, 1) <= ultimoDia.slice(0, 7);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
      <div className="grid gap-6">
        <section
          aria-labelledby="escolha-data"
          className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-200/70 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="escolha-data"
              className="flex items-center gap-2 whitespace-nowrap font-display text-base font-semibold text-ink-900 sm:text-lg"
            >
              <span className="grid size-7 place-items-center rounded-full bg-pool-700 text-sm text-white">
                1
              </span>
              Escolha a data
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMes((atual) => deslocarMes(atual, -1))}
                disabled={!podeVoltar}
                className="grid size-10 place-items-center rounded-full text-ink-700 hover:bg-ink-100 disabled:opacity-30"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <p className="min-w-36 text-center text-sm font-semibold text-ink-800" aria-live="polite">
                {capitalizar(formatMonthYear(mes))}
              </p>
              <button
                type="button"
                onClick={() => setMes((atual) => deslocarMes(atual, 1))}
                disabled={!podeAvancar}
                className="grid size-10 place-items-center rounded-full text-ink-700 hover:bg-ink-100 disabled:opacity-30"
                aria-label="Próximo mês"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </div>
          </div>

          {erroDoCalendario ? (
            <Alert tone="danger" className="mt-4">
              {erroDoCalendario}
            </Alert>
          ) : null}

          <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAY_SHORT_LABELS.map((dia) => (
              <p
                key={dia}
                className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400"
              >
                {dia}
              </p>
            ))}
            {Array.from({ length: vazios }, (_, indice) => (
              <span key={`vazio-${indice}`} aria-hidden />
            ))}
            {Array.from({ length: totalDeDias }, (_, indice) => {
              const dataDoDia = `${mes}-${String(indice + 1).padStart(2, '0')}`;
              const dia = porData.get(dataDoDia);
              const carregando = diasDoMes === null;
              const disponivel = dia?.status === 'AVAILABLE' || dia?.status === 'FEW_LEFT';
              const selecionado = data === dataDoDia;
              const motivo =
                dia?.reason ??
                (dataDoDia < today
                  ? 'Data que já passou'
                  : dataDoDia > ultimoDia
                    ? 'Ainda não está à venda'
                    : 'Fechado');
              return (
                <button
                  key={dataDoDia}
                  type="button"
                  disabled={!disponivel}
                  onClick={() => escolherData(dataDoDia)}
                  aria-pressed={selecionado}
                  aria-label={`${formatDateLong(dataDoDia)}${disponivel ? (dia?.fromPriceCents ? `, a partir de ${formatBRL(dia.fromPriceCents)}` : '') : `: ${motivo}`}`}
                  title={disponivel ? undefined : motivo}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center rounded-xl text-center transition-colors sm:aspect-[1.15]',
                    carregando && 'animate-pulse bg-ink-50',
                    !carregando && !disponivel && 'cursor-not-allowed text-ink-300',
                    disponivel &&
                      !selecionado &&
                      'bg-pool-50/70 text-ink-900 ring-1 ring-inset ring-pool-100 hover:bg-pool-100',
                    selecionado && 'bg-pool-700 text-white shadow-[0_6px_16px_-6px_rgb(20_111_131/0.7)]',
                  )}
                >
                  <span className="tabular text-[15px] font-semibold leading-none">{indice + 1}</span>
                  {disponivel && dia?.fromPriceCents ? (
                    <span
                      className={cn(
                        'mt-1 hidden text-[10px] leading-none sm:block',
                        selecionado ? 'text-pool-100' : 'text-ink-500',
                      )}
                    >
                      {precoCurto(dia.fromPriceCents)}
                    </span>
                  ) : null}
                  {dia?.status === 'FEW_LEFT' ? (
                    <span
                      aria-hidden
                      className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-sun-500"
                    />
                  ) : null}
                  {dia?.status === 'SOLD_OUT' ? (
                    <span className="mt-1 text-[9px] font-semibold uppercase leading-none text-danger-600">
                      Esgotado
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded bg-pool-50 ring-1 ring-inset ring-pool-200" />{' '}
              Disponível
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-sun-500" /> Últimas vagas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded bg-ink-100" /> Fechado ou indisponível
            </span>
          </div>
        </section>

        <section
          ref={secaoDeIngressos}
          aria-labelledby="escolha-ingressos"
          className="scroll-mt-20 rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-200/70 sm:p-6"
        >
          <h2
            id="escolha-ingressos"
            className="flex items-center gap-2 whitespace-nowrap font-display text-base font-semibold text-ink-900 sm:text-lg"
          >
            <span
              className={cn(
                'grid size-7 place-items-center rounded-full text-sm',
                data ? 'bg-pool-700 text-white' : 'bg-ink-100 text-ink-500',
              )}
            >
              2
            </span>
            Escolha os ingressos
          </h2>

          {!data ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-500">
              <CalendarDays className="size-4" aria-hidden /> Escolha uma data no calendário para ver os
              ingressos e preços.
            </p>
          ) : carregandoOferta && !oferta ? (
            <div className="mt-5 grid gap-3">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
          ) : oferta ? (
            <div className="mt-4 grid gap-4">
              <div className="rounded-2xl bg-ink-50 px-4 py-3 text-sm">
                <p className="font-semibold text-ink-900">{capitalizar(formatDateLong(oferta.date))}</p>
                <p className="text-ink-500">
                  {oferta.day?.opensAt && oferta.day.closesAt
                    ? `Parque aberto das ${oferta.day.opensAt} às ${oferta.day.closesAt}`
                    : 'Parque aberto'}
                  {oferta.day?.label ? ` · ${oferta.day.label}` : ''}
                </p>
              </div>
              {oferta.blocker ? <Alert tone="warning">{oferta.blocker}</Alert> : null}
              <ul className={cn('grid gap-3', carregandoOferta && 'opacity-60')}>
                {tipos.map((tipo) => {
                  const limite = limiteDoTipo(tipo, oferta);
                  const quantidade = quantidades[tipo.id] ?? 0;
                  return (
                    <li
                      key={tipo.id}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl p-4 ring-1 ring-inset transition-colors',
                        quantidade > 0 ? 'bg-pool-50/60 ring-pool-300' : 'ring-ink-200',
                      )}
                    >
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="font-semibold text-ink-900">
                          {tipo.name}
                          {tipo.peoplePerTicket > 1 ? (
                            <span className="ml-2 rounded-full bg-grape-50 px-2 py-0.5 text-xs font-semibold text-grape-700">
                              {tipo.peoplePerTicket} pessoas
                            </span>
                          ) : null}
                        </p>
                        {tipo.description ? (
                          <p className="mt-0.5 text-[13px] leading-5 text-ink-500">{tipo.description}</p>
                        ) : null}
                        {tipo.documentHint ? (
                          <p className="mt-1 text-xs text-ink-500">
                            Na entrada: {tipo.documentHint.toLowerCase()}
                          </p>
                        ) : null}
                        {tipo.remainingUnits !== null && tipo.remainingUnits <= 20 ? (
                          <p className="mt-1 text-xs font-semibold text-sun-700">
                            {tipo.remainingUnits === 0
                              ? 'Esgotado para esta data'
                              : `Restam ${tipo.remainingUnits}`}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          {tipo.compareAtCents ? (
                            <p className="tabular text-xs text-ink-400 line-through">
                              {formatBRL(tipo.compareAtCents)}
                            </p>
                          ) : null}
                          <p className="tabular font-display text-lg font-semibold text-ink-900">
                            {tipo.priceCents === 0 ? 'Gratuito' : formatBRL(tipo.priceCents)}
                          </p>
                        </div>
                        <QuantityStepper
                          value={quantidade}
                          max={limite}
                          label={tipo.name}
                          disabled={limite === 0 || Boolean(oferta.blocker)}
                          onChange={(valor) => setQuantidades((atuais) => ({ ...atuais, [tipo.id]: valor }))}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {tipos.length === 0 && !oferta.blocker ? (
                <p className="text-sm text-ink-500">Nenhum ingresso à venda pelo site para esta data.</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <aside className="lg:sticky lg:top-24">
        <div className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/70 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink-900">Resumo</h2>
          {escolhidos.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-500">
              <Ticket className="size-4" aria-hidden />
              {data ? 'Escolha a quantidade de ingressos.' : 'Nenhum ingresso escolhido.'}
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm">
              {escolhidos.map((tipo) => (
                <li key={tipo.id} className="flex justify-between gap-3">
                  <span className="text-ink-700">
                    {quantidades[tipo.id]} × {tipo.name}
                  </span>
                  <span className="tabular font-medium text-ink-900">
                    {formatBRL((quantidades[tipo.id] ?? 0) * tipo.priceCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
            <span className="text-sm text-ink-500">
              {totalDeIngressos > 0
                ? `${totalDeIngressos} ${totalDeIngressos === 1 ? 'ingresso' : 'ingressos'}`
                : 'Total'}
            </span>
            <span className="tabular font-display text-2xl font-semibold text-ink-900">
              {formatBRL(subtotal)}
            </span>
          </div>

          {erro ? (
            <Alert tone="danger" className="mt-4">
              {erro}
            </Alert>
          ) : null}
          {passouDoLimite && oferta ? (
            <Alert tone="warning" className="mt-4">
              Cada pedido pode ter até {oferta.maxTicketsPerOrder} ingressos. Para grupos maiores, faça mais
              de um pedido ou fale com o parque.
            </Alert>
          ) : null}
          {semVagas && oferta ? (
            <Alert tone="warning" className="mt-4">
              Restam {oferta.available} vagas para esta data.
            </Alert>
          ) : null}
          {abaixoDoMinimo ? (
            <Alert tone="warning" className="mt-4">
              {abaixoDoMinimo.name}: compre pelo menos {abaixoDoMinimo.minPerOrder}.
            </Alert>
          ) : null}

          <Button
            variant="cta"
            size="lg"
            className="mt-5 w-full"
            disabled={!podeContinuar}
            loading={enviando}
            onClick={() => void continuar()}
          >
            Continuar
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-500">
            <ShieldCheck className="size-3.5 text-success-700" aria-hidden />
            Pagamento por PIX. Ingresso com QR Code na hora.
          </p>
        </div>
      </aside>
    </div>
  );
}
