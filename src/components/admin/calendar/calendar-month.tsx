'use client';

import { CalendarPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { weekdayOf } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { DAY_KIND_LABELS, type DayKind } from '@/lib/pricing';
import { formatDateLong, WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import { Dialog, DialogContent, DialogTrigger } from '../../ui/dialog';
import { Checkbox, Field, fieldIds, Input, Select, Textarea } from '../../ui/field';

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
}

const TIPOS_MANUAIS: DayKind[] = ['HOLIDAY', 'EVENT', 'SPECIAL'];

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function DiaDialog({
  dia,
  defaults,
  onClose,
}: {
  dia: CalendarCell;
  defaults: DayDefaults;
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

  return (
    <DialogContent
      title={capitalizar(formatDateLong(dia.date))}
      description={
        dia.sold + dia.held > 0
          ? `${formatNumber(dia.sold)} ingressos vendidos e ${formatNumber(dia.held)} aguardando pagamento. Um dia com vendas não pode ser fechado nem ficar com lotação menor que isso.`
          : 'Nenhuma venda para este dia ainda.'
      }
      size="md"
    >
      <form onSubmit={salvar} noValidate className="grid gap-5">
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
            <Field id="dia-lotacao" label="Lotação" hint="Pessoas no dia." error={campos.capacity}>
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
          <Field id="dia-tipo" label="Tipo do dia (para o preço)" error={campos.dayKind}>
            <Select
              id="dia-tipo"
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value as DayKind | '')}
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
          <Field id="dia-rotulo" label="Nome do dia" hint="Ex.: Dia das Crianças." error={campos.label}>
            <Input
              id="dia-rotulo"
              value={rotulo}
              maxLength={80}
              onChange={(evento) => setRotulo(evento.target.value)}
              {...fieldIds('dia-rotulo', { hint: true, error: campos.label })}
            />
          </Field>
        </div>
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
  const [dias, setDias] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
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
            : 'Abra ou feche vários dias de uma vez, com horário e lotação. Dias com vendas nunca são fechados nem reduzidos abaixo do vendido.'
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
                <Field id="periodo-lotacao" label="Lotação" error={campos.capacity}>
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
}: {
  days: CalendarCell[];
  today: string;
  canManage: boolean;
  defaults: DayDefaults;
}) {
  const [selecionado, setSelecionado] = useState<CalendarCell | null>(null);
  const primeiro = days[0];
  const vazios = primeiro ? weekdayOf(primeiro.date) : 0;

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
              className="min-h-16 border-b border-r border-ink-100 bg-ink-50/30 sm:min-h-28"
            />
          ))}
          {days.map((dia) => {
            const passado = dia.date < today;
            const aberto = dia.status === 'OPEN';
            const capacidade = dia.capacity ?? 0;
            const ocupacao =
              aberto && capacidade > 0 ? Math.min(100, ((dia.sold + dia.held) / capacidade) * 100) : 0;
            const esgotado = aberto && dia.available === 0;
            const especial = dia.dayKindOverride !== null;
            const conteudo = (
              <>
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
                </div>
                <div className="mt-1 hidden text-left text-[11px] leading-4 sm:block">
                  {aberto ? (
                    <>
                      <p className="font-semibold text-success-700">{esgotado ? 'Esgotado' : 'Aberto'}</p>
                      <p className="text-ink-500">
                        {dia.opensAt && dia.closesAt ? `${dia.opensAt} às ${dia.closesAt}` : 'Horário livre'}
                      </p>
                      <p className="tabular text-ink-600">
                        {formatNumber(dia.sold)} / {formatNumber(capacidade)}
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
                        ocupacao >= 90 ? 'bg-danger-600' : ocupacao >= 60 ? 'bg-sun-400' : 'bg-pool-500',
                      )}
                      style={{ width: `${ocupacao}%` }}
                    />
                  </div>
                ) : null}
              </>
            );
            const classes = cn(
              'flex min-h-16 flex-col border-b border-r border-ink-100 p-1.5 sm:min-h-28 sm:p-2',
              dia.status === 'CLOSED' && 'bg-ink-50/80',
              passado && 'opacity-55',
            );
            return canManage ? (
              <button
                key={dia.date}
                type="button"
                onClick={() => setSelecionado(dia)}
                className={cn(
                  classes,
                  'text-left transition-colors hover:bg-pool-50/60 focus-visible:relative focus-visible:z-10',
                )}
                aria-label={`${formatDateLong(dia.date)}: ${aberto ? 'aberto' : dia.status === 'CLOSED' ? 'fechado' : 'sem configuração'}. Editar dia`}
              >
                {conteudo}
              </button>
            ) : (
              <div key={dia.date} className={classes}>
                {conteudo}
              </div>
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
            onClose={() => setSelecionado(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
