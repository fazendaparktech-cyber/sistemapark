'use client';

import { CalendarPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { weekdayOf } from '@/lib/dates';
import { formatNumber, formatPercent } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { DAY_KIND_LABELS, type DayKind } from '@/lib/pricing';
import { formatDateLong, WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import { Dialog, DialogContent, DialogTrigger } from '../../ui/dialog';
import { Spinner } from '../../ui/feedback';
import { Checkbox, Field, fieldIds, Input, Select, Textarea } from '../../ui/field';
import { MoneyInput } from '../../ui/money-input';

export interface CalendarCell {
  date: string;
  configured: boolean;
  status: 'OPEN' | 'CLOSED' | null;
  opensAt: string | null;
  closesAt: string | null;
  capacity: number | null;
  dayKind: DayKind;
  dayKindOverride: DayKind | null;
  label: string | null;
  notes: string | null;
  sold: number;
  held: number;
  available: number | null;
}

export interface DayDefaults {
  opensAt: string;
  closesAt: string;
  capacity: number;
  /** Dias da semana já marcados ao abrir um período. */
  weekdays?: number[];
}

const TIPOS_MANUAIS: DayKind[] = ['HOLIDAY', 'EVENT', 'SPECIAL'];

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

interface PrecoDoDia {
  ticketTypeId: string;
  name: string;
  basePriceCents: number;
  currentPriceCents: number;
  currentLabel: string | null;
  specialPriceCents: number | null;
}

function Estatistica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-ink-50 px-3 py-2.5 ring-1 ring-inset ring-ink-200/70">
      <dt className="text-xs font-medium text-ink-500">{rotulo}</dt>
      <dd className="tabular font-display text-lg font-semibold text-ink-900">{valor}</dd>
    </div>
  );
}

function DiaDialog({
  dia,
  defaults,
  canManage,
  onClose,
}: {
  dia: CalendarCell;
  defaults: DayDefaults;
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>(dia.status ?? 'OPEN');
  const [abre, setAbre] = useState(dia.opensAt ?? defaults.opensAt);
  const [fecha, setFecha] = useState(dia.closesAt ?? defaults.closesAt);
  const [lotacao, setLotacao] = useState(String(dia.capacity ?? defaults.capacity));
  const [tipo, setTipo] = useState<DayKind | ''>(dia.dayKindOverride ?? '');
  const [rotulo, setRotulo] = useState(dia.label ?? '');
  const [observacoes, setObservacoes] = useState(dia.notes ?? '');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [precos, setPrecos] = useState<PrecoDoDia[] | null>(null);
  const [erroDosPrecos, setErroDosPrecos] = useState<string | null>(null);
  const [especiais, setEspeciais] = useState<Record<string, number | null>>({});

  useEffect(() => {
    const controle = new AbortController();
    api<PrecoDoDia[]>(`/api/admin/calendar/days/${dia.date}/prices`, { signal: controle.signal })
      .then((lista) => {
        setPrecos(lista);
        setEspeciais(Object.fromEntries(lista.map((item) => [item.ticketTypeId, item.specialPriceCents])));
      })
      .catch((falha: unknown) => {
        if (falha instanceof DOMException && falha.name === 'AbortError') return;
        setErroDosPrecos(errorMessage(falha));
      });
    return () => controle.abort();
  }, [dia.date]);

  const aberto = dia.status === 'OPEN';
  const capacidade = dia.capacity ?? 0;
  const ocupacao = aberto && capacidade > 0 ? (dia.sold + dia.held) / capacidade : 0;
  const precosAlterados = (precos ?? []).filter(
    (item) => (especiais[item.ticketTypeId] ?? null) !== item.specialPriceCents,
  );

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setCampos({});
    setEnviando(true);
    try {
      await api(`/api/admin/calendar/days/${dia.date}`, {
        method: 'PUT',
        body: {
          status,
          opensAt: status === 'OPEN' ? abre || null : null,
          closesAt: status === 'OPEN' ? fecha || null : null,
          capacity: Number(lotacao || 0),
          dayKind: tipo || null,
          label: rotulo || null,
          notes: observacoes || null,
        },
      });
      if (precosAlterados.length > 0) {
        await api(`/api/admin/calendar/days/${dia.date}/prices`, {
          method: 'PUT',
          body: {
            prices: precosAlterados.map((item) => ({
              ticketTypeId: item.ticketTypeId,
              priceCents: especiais[item.ticketTypeId] ?? null,
            })),
          },
        });
      }
      toast.success('Dia salvo no calendário.');
      onClose();
      router.refresh();
    } catch (falha) {
      if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) setCampos(falha.fields);
      else setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  const estatisticas = (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Estatistica rotulo="Capacidade" valor={aberto ? formatNumber(capacidade) : 'Fechado'} />
      <Estatistica rotulo="Vendidos" valor={formatNumber(dia.sold)} />
      <Estatistica rotulo="Disponíveis" valor={formatNumber(aberto ? (dia.available ?? 0) : 0)} />
      <Estatistica rotulo="Ocupação" valor={formatPercent(ocupacao)} />
    </dl>
  );

  const listaDePrecos = (
    <section className="grid gap-3" aria-labelledby={`precos-${dia.date}`}>
      <div>
        <h3 id={`precos-${dia.date}`} className="text-sm font-semibold text-ink-900">
          Preços do dia
        </h3>
        <p className="text-[13px] text-ink-500">
          {canManage
            ? 'Deixe em branco para usar o preço normal. O preço especial vale só nesta data, no site e no balcão.'
            : 'Preço cobrado por tipo de ingresso nesta data.'}
        </p>
      </div>
      {erroDosPrecos ? (
        <Alert tone="danger">{erroDosPrecos}</Alert>
      ) : !precos ? (
        <p className="flex items-center gap-2 text-sm text-ink-500">
          <Spinner className="size-4" />
          Carregando preços
        </p>
      ) : precos.length === 0 ? (
        <p className="text-sm text-ink-500">Nenhum tipo de ingresso ativo.</p>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-xl ring-1 ring-inset ring-ink-200">
          {precos.map((item) => (
            <li
              key={item.ticketTypeId}
              className="grid items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_11rem]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{item.name}</p>
                <p className="text-xs text-ink-500">
                  Vale no dia:{' '}
                  <span className="tabular font-medium text-ink-700">
                    {formatBRL(item.currentPriceCents)}
                  </span>
                  {item.currentLabel ? ` (${item.currentLabel})` : ' (preço base)'}
                </p>
              </div>
              {canManage ? (
                <MoneyInput
                  id={`preco-especial-${item.ticketTypeId}`}
                  aria-label={`Preço especial de ${item.name}`}
                  placeholder="Sem preço especial"
                  valueCents={especiais[item.ticketTypeId] ?? null}
                  onValueChange={(valor) =>
                    setEspeciais((atuais) => ({ ...atuais, [item.ticketTypeId]: valor }))
                  }
                />
              ) : item.specialPriceCents !== null ? (
                <p className="tabular text-sm font-semibold text-grape-700 sm:text-right">
                  Especial: {formatBRL(item.specialPriceCents)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const descricao =
    dia.sold + dia.held > 0
      ? `${formatNumber(dia.sold)} vendidos${
          dia.held > 0 ? ` e ${formatNumber(dia.held)} aguardando pagamento` : ''
        }. Dia com vendas não pode ser fechado nem ficar com capacidade menor que isso.`
      : 'Nenhuma venda para este dia ainda.';

  if (!canManage) {
    return (
      <DialogContent title={capitalizar(formatDateLong(dia.date))} description={descricao} size="lg">
        <div className="grid gap-5">
          {estatisticas}
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Situação</dt>
              <dd className="font-medium text-ink-900">
                {aberto ? 'Aberto' : dia.status === 'CLOSED' ? 'Fechado' : 'Sem configuração'}
              </dd>
            </div>
            {aberto ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Horário</dt>
                <dd className="font-medium text-ink-900">
                  {dia.opensAt && dia.closesAt ? `${dia.opensAt} às ${dia.closesAt}` : 'Não informado'}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Tipo do dia</dt>
              <dd className="font-medium text-ink-900">{dia.label ?? DAY_KIND_LABELS[dia.dayKind]}</dd>
            </div>
          </dl>
          {listaDePrecos}
          <div className="flex justify-end border-t border-ink-100 pt-5">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent title={capitalizar(formatDateLong(dia.date))} description={descricao} size="lg">
      <form onSubmit={salvar} noValidate className="grid gap-5">
        {estatisticas}
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        <div role="radiogroup" aria-label="Situação do dia" className="grid grid-cols-2 gap-2">
          {(
            [
              ['OPEN', 'Aberto'],
              ['CLOSED', 'Fechado'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={status === valor}
              onClick={() => setStatus(valor)}
              className={cn(
                'h-10 rounded-xl text-sm font-semibold ring-1 ring-inset transition-colors',
                status === valor
                  ? valor === 'OPEN'
                    ? 'bg-success-50 text-success-800 ring-success-600'
                    : 'bg-ink-100 text-ink-800 ring-ink-500'
                  : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
              )}
            >
              {texto}
            </button>
          ))}
        </div>
        {status === 'OPEN' ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="dia-abre" label="Abre às" error={campos.opensAt}>
              <Input
                id="dia-abre"
                type="time"
                value={abre}
                onChange={(evento) => setAbre(evento.target.value)}
              />
            </Field>
            <Field id="dia-fecha" label="Fecha às" error={campos.closesAt}>
              <Input
                id="dia-fecha"
                type="time"
                value={fecha}
                onChange={(evento) => setFecha(evento.target.value)}
              />
            </Field>
            <Field id="dia-lotacao" label="Capacidade" hint="Pessoas no dia." error={campos.capacity}>
              <Input
                id="dia-lotacao"
                inputMode="numeric"
                value={lotacao}
                onChange={(evento) => setLotacao(evento.target.value.replace(/\D/g, '').slice(0, 6))}
                {...fieldIds('dia-lotacao', { hint: true, error: campos.capacity })}
              />
            </Field>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="dia-tipo"
            label="Tipo do dia"
            hint="Feriado, evento ou data especial."
            error={campos.dayKind}
          >
            <Select
              id="dia-tipo"
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value as DayKind | '')}
              {...fieldIds('dia-tipo', { hint: true, error: campos.dayKind })}
            >
              <option value="">
                {weekdayOf(dia.date) === 0 || weekdayOf(dia.date) === 6 ? 'Fim de semana' : 'Dia útil'}
              </option>
              {TIPOS_MANUAIS.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {DAY_KIND_LABELS[opcao]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="dia-rotulo"
            label="Nome do dia ou evento"
            hint="Ex.: Dia das Crianças."
            error={campos.label}
          >
            <Input
              id="dia-rotulo"
              value={rotulo}
              maxLength={80}
              onChange={(evento) => setRotulo(evento.target.value)}
              {...fieldIds('dia-rotulo', { hint: true, error: campos.label })}
            />
          </Field>
        </div>
        {listaDePrecos}
        <Field id="dia-observacoes" label="Observações internas" error={campos.notes}>
          <Textarea
            id="dia-observacoes"
            value={observacoes}
            maxLength={500}
            onChange={(evento) => setObservacoes(evento.target.value)}
          />
        </Field>
        <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" loading={enviando}>
            Salvar dia
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

interface ResultadoDoPeriodo {
  created: number;
  updated: number;
  skipped: number;
  conflicts: { date: string; reason: string }[];
}

export function PeriodDialog({
  defaults,
  initialFrom,
  initialTo,
}: {
  defaults: DayDefaults;
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(initialFrom);
  const [ate, setAte] = useState(initialTo);
  const [dias, setDias] = useState<number[]>(defaults.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [abre, setAbre] = useState(defaults.opensAt);
  const [fecha, setFecha] = useState(defaults.closesAt);
  const [lotacao, setLotacao] = useState(String(defaults.capacity));
  const [substituir, setSubstituir] = useState(false);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDoPeriodo | null>(null);

  function mudarAbertura(novo: boolean) {
    if (enviando) return;
    if (!novo && resultado) router.refresh();
    if (novo) {
      setResultado(null);
      setErro(null);
      setCampos({});
    }
    setAberto(novo);
  }

  async function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setCampos({});
    setEnviando(true);
    try {
      const resposta = await api<ResultadoDoPeriodo>('/api/admin/calendar/period', {
        method: 'POST',
        body: {
          from: de,
          to: ate,
          weekdays: dias,
          status,
          opensAt: status === 'OPEN' ? abre || null : null,
          closesAt: status === 'OPEN' ? fecha || null : null,
          capacity: Number(lotacao || 0),
          overwrite: substituir,
        },
      });
      setResultado(resposta);
    } catch (falha) {
      if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) setCampos(falha.fields);
      else setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAbertura}>
      <DialogTrigger asChild>
        <Button>
          <CalendarPlus className="size-4" aria-hidden />
          Configurar período
        </Button>
      </DialogTrigger>
      <DialogContent
        title={resultado ? 'Período aplicado' : 'Configurar período'}
        description={
          resultado
            ? undefined
            : 'Abra ou feche vários dias de uma vez, com horário e capacidade. Dias com vendas nunca são fechados nem reduzidos abaixo do vendido.'
        }
        size="md"
      >
        {resultado ? (
          <div className="grid gap-4">
            <ul className="grid gap-1.5 text-sm text-ink-700">
              <li>
                <span className="tabular font-semibold text-ink-900">{resultado.created}</span> dias
                configurados pela primeira vez
              </li>
              <li>
                <span className="tabular font-semibold text-ink-900">{resultado.updated}</span> dias alterados
              </li>
              <li>
                <span className="tabular font-semibold text-ink-900">{resultado.skipped}</span> dias já
                configurados mantidos
              </li>
            </ul>
            {resultado.conflicts.length > 0 ? (
              <Alert tone="warning" title={`${resultado.conflicts.length} dias não foram alterados`}>
                <ul className="mt-1 grid gap-1">
                  {resultado.conflicts.slice(0, 8).map((conflito) => (
                    <li key={conflito.date}>
                      {conflito.date.split('-').reverse().join('/')}: {conflito.reason}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            <Button onClick={() => mudarAbertura(false)}>Concluir</Button>
          </div>
        ) : (
          <form onSubmit={aplicar} noValidate className="grid gap-5">
            {erro ? <Alert tone="danger">{erro}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="periodo-inicio" label="De" required error={campos.from}>
                <Input
                  id="periodo-inicio"
                  type="date"
                  value={de}
                  onChange={(evento) => setDe(evento.target.value)}
                />
              </Field>
              <Field id="periodo-fim" label="Até" required error={campos.to}>
                <Input
                  id="periodo-fim"
                  type="date"
                  value={ate}
                  onChange={(evento) => setAte(evento.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-2">
              <p className="text-[13px] font-semibold text-ink-800">Dias da semana</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_SHORT_LABELS.map((texto, dia) => (
                  <button
                    key={texto}
                    type="button"
                    aria-pressed={dias.includes(dia)}
                    onClick={() =>
                      setDias((atual) =>
                        atual.includes(dia) ? atual.filter((item) => item !== dia) : [...atual, dia].sort(),
                      )
                    }
                    className={cn(
                      'h-9 min-w-12 rounded-lg px-3 text-[13px] font-semibold ring-1 ring-inset transition-colors',
                      dias.includes(dia)
                        ? 'bg-pool-700 text-white ring-pool-700'
                        : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                    )}
                  >
                    {texto}
                  </button>
                ))}
              </div>
              {campos.weekdays ? (
                <p className="text-[13px] font-medium text-danger-700">{campos.weekdays}</p>
              ) : null}
            </div>
            <div role="radiogroup" aria-label="Situação dos dias" className="grid grid-cols-2 gap-2">
              {(
                [
                  ['OPEN', 'Abrir'],
                  ['CLOSED', 'Fechar'],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={status === valor}
                  onClick={() => setStatus(valor)}
                  className={cn(
                    'h-10 rounded-xl text-sm font-semibold ring-1 ring-inset transition-colors',
                    status === valor
                      ? 'bg-pool-50 text-pool-800 ring-pool-600'
                      : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
            {status === 'OPEN' ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="periodo-abre" label="Abre às" error={campos.opensAt}>
                  <Input
                    id="periodo-abre"
                    type="time"
                    value={abre}
                    onChange={(evento) => setAbre(evento.target.value)}
                  />
                </Field>
                <Field id="periodo-fecha" label="Fecha às" error={campos.closesAt}>
                  <Input
                    id="periodo-fecha"
                    type="time"
                    value={fecha}
                    onChange={(evento) => setFecha(evento.target.value)}
                  />
                </Field>
                <Field id="periodo-lotacao" label="Capacidade" error={campos.capacity}>
                  <Input
                    id="periodo-lotacao"
                    inputMode="numeric"
                    value={lotacao}
                    onChange={(evento) => setLotacao(evento.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </Field>
              </div>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-800">
              <Checkbox
                checked={substituir}
                onChange={(evento) => setSubstituir(evento.target.checked)}
                className="mt-0.5"
              />
              <span>
                Substituir dias já configurados
                <span className="block text-[13px] text-ink-500">
                  Desmarcado, só configura os dias ainda em branco.
                </span>
              </span>
            </label>
            <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => mudarAbertura(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button type="submit" loading={enviando}>
                Aplicar ao período
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CalendarMonth({
  days,
  today,
  canManage,
  defaults,
  specialPriceDates,
}: {
  days: CalendarCell[];
  today: string;
  canManage: boolean;
  defaults: DayDefaults;
  specialPriceDates: readonly string[];
}) {
  const [selecionado, setSelecionado] = useState<CalendarCell | null>(null);
  const primeiro = days[0];
  const vazios = primeiro ? weekdayOf(primeiro.date) : 0;
  const comPrecoEspecial = new Set(specialPriceDates);

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink-200/70">
        <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50/70">
          {WEEKDAY_SHORT_LABELS.map((dia) => (
            <p key={dia} className="py-2.5 text-center text-xs font-semibold text-ink-500">
              {dia}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: vazios }, (_, indice) => (
            <div
              key={`vazio-${indice}`}
              className="min-h-16 border-b border-r border-ink-100 bg-ink-50/30 sm:min-h-32"
            />
          ))}
          {days.map((dia) => {
            const passado = dia.date < today;
            const aberto = dia.status === 'OPEN';
            const capacidade = dia.capacity ?? 0;
            const ocupados = dia.sold + dia.held;
            const ocupacao = aberto && capacidade > 0 ? Math.min(100, (ocupados / capacidade) * 100) : 0;
            const esgotado = aberto && dia.available === 0;
            const especial = dia.dayKindOverride !== null || dia.label !== null;
            const precoEspecial = comPrecoEspecial.has(dia.date);
            const situacao = aberto
              ? `aberto, capacidade ${formatNumber(capacidade)}, ${formatNumber(dia.sold)} vendidos, ${formatNumber(dia.available ?? 0)} disponíveis, ocupação ${Math.round(ocupacao)}%`
              : dia.status === 'CLOSED'
                ? 'fechado'
                : 'sem configuração';

            return (
              <button
                key={dia.date}
                type="button"
                onClick={() => setSelecionado(dia)}
                aria-label={`${formatDateLong(dia.date)}: ${situacao}. ${canManage ? 'Editar dia' : 'Ver dia'}`}
                className={cn(
                  'flex min-h-16 flex-col border-b border-r border-ink-100 p-1.5 text-left transition-colors hover:bg-pool-50/60 focus-visible:relative focus-visible:z-10 sm:min-h-32 sm:p-2',
                  dia.status === 'CLOSED' && 'bg-ink-50/80',
                  passado && 'opacity-55',
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={cn(
                      'tabular grid size-6 place-items-center rounded-full text-[13px] font-semibold',
                      dia.date === today ? 'bg-pool-700 text-white' : 'text-ink-800',
                    )}
                  >
                    {Number(dia.date.slice(8))}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 size-2 rounded-full sm:hidden',
                      aberto
                        ? esgotado
                          ? 'bg-danger-600'
                          : 'bg-success-600'
                        : dia.status === 'CLOSED'
                          ? 'bg-ink-300'
                          : 'bg-transparent ring-1 ring-ink-300',
                    )}
                  />
                  {precoEspecial ? (
                    <span className="hidden rounded bg-sun-100 px-1 text-[10px] font-semibold text-sun-800 sm:inline">
                      Preço especial
                    </span>
                  ) : null}
                </div>
                {aberto ? (
                  <p className="tabular mt-0.5 text-[10px] font-semibold text-ink-500 sm:hidden">
                    {Math.round(ocupacao)}%
                  </p>
                ) : null}
                <div className="mt-1 hidden text-left text-[11px] leading-4 sm:block">
                  {aberto ? (
                    <>
                      <p className={cn('font-semibold', esgotado ? 'text-danger-700' : 'text-success-700')}>
                        {esgotado ? 'Esgotado' : 'Aberto'}
                        {dia.opensAt && dia.closesAt ? (
                          <span className="font-normal text-ink-500">
                            {' '}
                            {dia.opensAt}-{dia.closesAt}
                          </span>
                        ) : null}
                      </p>
                      <p className="tabular text-ink-700">
                        <span className="font-semibold">{formatNumber(dia.sold)}</span> de{' '}
                        {formatNumber(capacidade)} vendidos
                      </p>
                      <p className="tabular text-ink-500">
                        {formatNumber(dia.available ?? 0)} livres · {Math.round(ocupacao)}%
                      </p>
                    </>
                  ) : dia.status === 'CLOSED' ? (
                    <p className="font-semibold text-ink-400">Fechado</p>
                  ) : (
                    <p className="text-ink-400">Sem configuração</p>
                  )}
                  {especial ? (
                    <p className="truncate font-semibold text-grape-700">
                      {dia.label ?? DAY_KIND_LABELS[dia.dayKind]}
                    </p>
                  ) : null}
                </div>
                {aberto && capacidade > 0 ? (
                  <div className="mt-auto h-1 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        ocupacao >= 90 ? 'bg-danger-600' : ocupacao >= 80 ? 'bg-sun-400' : 'bg-pool-500',
                      )}
                      style={{ width: `${ocupacao}%` }}
                    />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={selecionado !== null} onOpenChange={(aberto) => (aberto ? null : setSelecionado(null))}>
        {selecionado ? (
          <DiaDialog
            key={selecionado.date}
            dia={selecionado}
            defaults={defaults}
            canManage={canManage}
            onClose={() => setSelecionado(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
