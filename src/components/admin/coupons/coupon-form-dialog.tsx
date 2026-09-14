'use client';

import { Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { WEEKDAY_SHORT_LABELS } from '@/lib/weekdays';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import { Dialog, DialogContent, DialogTrigger } from '../../ui/dialog';
import { Checkbox, Field, fieldIds, Input } from '../../ui/field';
import { MoneyInput } from '../../ui/money-input';

/** Valores do cupom como chegam do painel (datas em AAAA-MM-DD). */
export interface CouponFormInitial {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FIXED';
  percentBps: number | null;
  amountCents: number | null;
  maxDiscountCents: number | null;
  minOrderCents: number | null;
  startsOn: string | null;
  endsOn: string | null;
  visitFrom: string | null;
  visitUntil: string | null;
  weekdays: number[];
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  firstPurchaseOnly: boolean;
  channels: ('ONLINE' | 'POS')[];
  ticketTypeIds: string[];
  isActive: boolean;
}

function percentualEmTexto(bps: number | null): string {
  if (bps === null) return '';
  return (bps / 100).toString().replace('.', ',');
}

function textoEmPercentual(texto: string): number | null {
  const valor = Number(texto.trim().replace(',', '.'));
  if (!texto.trim() || !Number.isFinite(valor)) return null;
  return Math.round(valor * 100);
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-ink-100 pt-5 first:border-t-0 first:pt-0">
      <legend className="float-left mb-1 w-full">
        <span className="block font-display text-[15px] font-semibold text-ink-900">{titulo}</span>
        {descricao ? <span className="mt-0.5 block text-[13px] text-ink-500">{descricao}</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}

export function CouponFormDialog({
  coupon,
  ticketTypes,
  trigger = 'button',
}: {
  coupon?: CouponFormInitial;
  ticketTypes: { id: string; name: string }[];
  trigger?: 'button' | 'edit';
}) {
  const router = useRouter();
  const editando = Boolean(coupon);
  const [aberto, setAberto] = useState(false);
  const [versao, setVersao] = useState(0);

  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [percentual, setPercentual] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [maximo, setMaximo] = useState<number | null>(null);
  const [minimo, setMinimo] = useState<number | null>(null);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [visitaDe, setVisitaDe] = useState('');
  const [visitaAte, setVisitaAte] = useState('');
  const [dias, setDias] = useState<number[]>([]);
  const [usos, setUsos] = useState('');
  const [usosPorCpf, setUsosPorCpf] = useState('');
  const [primeiraCompra, setPrimeiraCompra] = useState(false);
  const [canais, setCanais] = useState<('ONLINE' | 'POS')[]>(['ONLINE', 'POS']);
  const [tipos, setTipos] = useState<string[]>([]);
  const [ativo, setAtivo] = useState(true);

  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function preencher() {
    setCodigo(coupon?.code ?? '');
    setDescricao(coupon?.description ?? '');
    setTipo(coupon?.discountType ?? 'PERCENT');
    setPercentual(percentualEmTexto(coupon?.percentBps ?? null));
    setValor(coupon?.amountCents ?? null);
    setMaximo(coupon?.maxDiscountCents ?? null);
    setMinimo(coupon?.minOrderCents ?? null);
    setInicio(coupon?.startsOn ?? '');
    setFim(coupon?.endsOn ?? '');
    setVisitaDe(coupon?.visitFrom ?? '');
    setVisitaAte(coupon?.visitUntil ?? '');
    setDias(coupon?.weekdays ?? []);
    setUsos(coupon?.maxUses?.toString() ?? '');
    setUsosPorCpf(coupon?.maxUsesPerCustomer?.toString() ?? '');
    setPrimeiraCompra(coupon?.firstPurchaseOnly ?? false);
    setCanais(coupon?.channels ?? ['ONLINE', 'POS']);
    setTipos(coupon?.ticketTypeIds ?? []);
    setAtivo(coupon?.isActive ?? true);
    setCampos({});
    setErro(null);
    // Os campos de dinheiro guardam o texto digitado: nova versão recria com o valor inicial.
    setVersao((atual) => atual + 1);
  }

  function mudarAbertura(novo: boolean) {
    if (enviando) return;
    if (novo) preencher();
    setAberto(novo);
  }

  function alternar<T>(lista: T[], item: T): T[] {
    return lista.includes(item) ? lista.filter((atual) => atual !== item) : [...lista, item];
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const bps = textoEmPercentual(percentual);
    const faltando: Record<string, string> = {};
    if (codigo.trim().length < 3) faltando.code = 'Use pelo menos 3 caracteres.';
    if (tipo === 'PERCENT' && (bps === null || bps <= 0 || bps > 10_000)) {
      faltando.percentBps = 'Informe um percentual entre 0,01 e 100.';
    }
    if (tipo === 'FIXED' && (valor === null || valor <= 0))
      faltando.amountCents = 'Informe o valor do desconto.';
    if (canais.length === 0) faltando.channels = 'Escolha onde o cupom vale.';
    setCampos(faltando);
    if (Object.keys(faltando).length > 0) return;

    const numero = (texto: string) => (texto.trim() ? Number(texto) : null);
    setEnviando(true);
    try {
      await api(editando ? `/api/admin/coupons/${coupon?.id}` : '/api/admin/coupons', {
        method: editando ? 'PUT' : 'POST',
        body: {
          code: codigo,
          description: descricao || null,
          discountType: tipo,
          percentBps: tipo === 'PERCENT' ? bps : null,
          amountCents: tipo === 'FIXED' ? valor : null,
          maxDiscountCents: tipo === 'PERCENT' ? maximo : null,
          minOrderCents: minimo,
          startsOn: inicio || null,
          endsOn: fim || null,
          visitFrom: visitaDe || null,
          visitUntil: visitaAte || null,
          weekdays: dias,
          maxUses: numero(usos),
          maxUsesPerCustomer: numero(usosPorCpf),
          firstPurchaseOnly: primeiraCompra,
          channels: canais,
          ticketTypeIds: tipos,
          isActive: ativo,
        },
      });
      toast.success(editando ? 'Cupom atualizado.' : `Cupom ${codigo.toUpperCase()} criado.`);
      setAberto(false);
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

  return (
    <Dialog open={aberto} onOpenChange={mudarAbertura}>
      <DialogTrigger asChild>
        {trigger === 'edit' ? (
          <Button variant="secondary">
            <Pencil className="size-4" aria-hidden />
            Editar cupom
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" aria-hidden />
            Novo cupom
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={editando ? `Editar cupom ${coupon?.code}` : 'Novo cupom de desconto'}
        description="O desconto é calculado e conferido no servidor em cada compra, com as regras abaixo."
        size="lg"
      >
        <form onSubmit={salvar} noValidate className="grid gap-5" key={versao}>
          {erro ? <Alert tone="danger">{erro}</Alert> : null}

          <Secao titulo="Cupom">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="cupom-codigo"
                label="Código"
                required
                hint="O que o cliente digita. Letras sem acento, números e hífen."
                error={campos.code}
              >
                <Input
                  id="cupom-codigo"
                  value={codigo}
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={30}
                  placeholder="VERAO10"
                  className="font-mono uppercase"
                  onChange={(evento) => setCodigo(evento.target.value.toUpperCase().replace(/\s/g, ''))}
                  {...fieldIds('cupom-codigo', { hint: true, error: campos.code })}
                />
              </Field>
              <Field
                id="cupom-descricao"
                label="Descrição interna"
                hint="Para a equipe saber do que se trata."
                error={campos.description}
              >
                <Input
                  id="cupom-descricao"
                  value={descricao}
                  maxLength={200}
                  placeholder="Campanha de verão no Instagram"
                  onChange={(evento) => setDescricao(evento.target.value)}
                  {...fieldIds('cupom-descricao', { hint: true, error: campos.description })}
                />
              </Field>
            </div>
          </Secao>

          <Secao titulo="Desconto">
            <div
              role="radiogroup"
              aria-label="Tipo de desconto"
              className="grid grid-cols-2 gap-2 sm:max-w-sm"
            >
              {(
                [
                  ['PERCENT', 'Percentual'],
                  ['FIXED', 'Valor fixo'],
                ] as const
              ).map(([valorDoTipo, rotulo]) => (
                <button
                  key={valorDoTipo}
                  type="button"
                  role="radio"
                  aria-checked={tipo === valorDoTipo}
                  onClick={() => setTipo(valorDoTipo)}
                  className={cn(
                    'h-10 rounded-xl text-sm font-semibold ring-1 ring-inset transition-colors',
                    tipo === valorDoTipo
                      ? 'bg-pool-50 text-pool-800 ring-pool-600'
                      : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {tipo === 'PERCENT' ? (
                <>
                  <Field id="cupom-percentual" label="Percentual" required error={campos.percentBps}>
                    <div className="relative">
                      <Input
                        id="cupom-percentual"
                        inputMode="decimal"
                        value={percentual}
                        placeholder="10"
                        className="tabular pr-9"
                        onChange={(evento) => setPercentual(evento.target.value.replace(/[^\d,.]/g, ''))}
                        {...fieldIds('cupom-percentual', { error: campos.percentBps })}
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500"
                      >
                        %
                      </span>
                    </div>
                  </Field>
                  <Field
                    id="cupom-maximo"
                    label="Desconto máximo"
                    hint="Opcional."
                    error={campos.maxDiscountCents}
                  >
                    <MoneyInput
                      id="cupom-maximo"
                      valueCents={maximo}
                      onValueChange={setMaximo}
                      {...fieldIds('cupom-maximo', { hint: true, error: campos.maxDiscountCents })}
                    />
                  </Field>
                </>
              ) : (
                <Field id="cupom-valor" label="Valor do desconto" required error={campos.amountCents}>
                  <MoneyInput
                    id="cupom-valor"
                    valueCents={valor}
                    onValueChange={setValor}
                    {...fieldIds('cupom-valor', { error: campos.amountCents })}
                  />
                </Field>
              )}
              <Field id="cupom-minimo" label="Compra mínima" hint="Opcional." error={campos.minOrderCents}>
                <MoneyInput
                  id="cupom-minimo"
                  valueCents={minimo}
                  onValueChange={setMinimo}
                  {...fieldIds('cupom-minimo', { hint: true, error: campos.minOrderCents })}
                />
              </Field>
            </div>
          </Secao>

          <Secao titulo="Quando vale" descricao="Deixe em branco o que não tiver limite.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="cupom-inicio" label="Pode ser usado a partir de" error={campos.startsOn}>
                <Input
                  id="cupom-inicio"
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                />
              </Field>
              <Field id="cupom-fim" label="Pode ser usado até" error={campos.endsOn}>
                <Input id="cupom-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              </Field>
              <Field id="cupom-visita-de" label="Visitas a partir de" error={campos.visitFrom}>
                <Input
                  id="cupom-visita-de"
                  type="date"
                  value={visitaDe}
                  onChange={(e) => setVisitaDe(e.target.value)}
                />
              </Field>
              <Field id="cupom-visita-ate" label="Visitas até" error={campos.visitUntil}>
                <Input
                  id="cupom-visita-ate"
                  type="date"
                  value={visitaAte}
                  onChange={(e) => setVisitaAte(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-2">
              <p className="text-[13px] font-semibold text-ink-800">Dias da semana da visita</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_SHORT_LABELS.map((rotulo, dia) => (
                  <button
                    key={rotulo}
                    type="button"
                    aria-pressed={dias.includes(dia)}
                    onClick={() => setDias((atual) => alternar(atual, dia).sort())}
                    className={cn(
                      'h-9 min-w-12 rounded-lg px-3 text-[13px] font-semibold ring-1 ring-inset transition-colors',
                      dias.includes(dia)
                        ? 'bg-pool-700 text-white ring-pool-700'
                        : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                    )}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              <p className="text-[13px] text-ink-500">
                {dias.length === 0
                  ? 'Nenhum dia marcado: vale para qualquer dia.'
                  : 'Vale só nos dias marcados.'}
              </p>
            </div>
          </Secao>

          <Secao titulo="Limites e alcance">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="cupom-usos"
                label="Usos no total"
                hint="Em branco: sem limite."
                error={campos.maxUses}
              >
                <Input
                  id="cupom-usos"
                  inputMode="numeric"
                  value={usos}
                  placeholder="Sem limite"
                  onChange={(evento) => setUsos(evento.target.value.replace(/\D/g, '').slice(0, 7))}
                  {...fieldIds('cupom-usos', { hint: true, error: campos.maxUses })}
                />
              </Field>
              <Field
                id="cupom-usos-cpf"
                label="Usos por CPF"
                hint="Em branco: sem limite por cliente."
                error={campos.maxUsesPerCustomer}
              >
                <Input
                  id="cupom-usos-cpf"
                  inputMode="numeric"
                  value={usosPorCpf}
                  placeholder="Sem limite"
                  onChange={(evento) => setUsosPorCpf(evento.target.value.replace(/\D/g, '').slice(0, 4))}
                  {...fieldIds('cupom-usos-cpf', { hint: true, error: campos.maxUsesPerCustomer })}
                />
              </Field>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-800">
              <Checkbox
                checked={primeiraCompra}
                onChange={(evento) => setPrimeiraCompra(evento.target.checked)}
                className="mt-0.5"
              />
              <span>
                Só para a primeira compra do cliente
                <span className="block text-[13px] text-ink-500">
                  Conferido pelo CPF informado na compra.
                </span>
              </span>
            </label>

            <div className="grid gap-2">
              <p className="text-[13px] font-semibold text-ink-800">Onde vale</p>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ['ONLINE', 'Site'],
                    ['POS', 'Bilheteria'],
                  ] as const
                ).map(([canal, rotulo]) => (
                  <label
                    key={canal}
                    className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-800"
                  >
                    <Checkbox
                      checked={canais.includes(canal)}
                      onChange={() => setCanais((atual) => alternar(atual, canal))}
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
              {campos.channels ? (
                <p className="text-[13px] font-medium text-danger-700">{campos.channels}</p>
              ) : null}
            </div>

            {ticketTypes.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-[13px] font-semibold text-ink-800">Ingressos com desconto</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ticketTypes.map((ingresso) => (
                    <label
                      key={ingresso.id}
                      className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-800"
                    >
                      <Checkbox
                        checked={tipos.includes(ingresso.id)}
                        onChange={() => setTipos((atual) => alternar(atual, ingresso.id))}
                      />
                      {ingresso.name}
                    </label>
                  ))}
                </div>
                <p className="text-[13px] text-ink-500">
                  {tipos.length === 0
                    ? 'Nenhum marcado: vale para todos os ingressos.'
                    : 'Desconto só nos ingressos marcados.'}
                </p>
              </div>
            ) : null}
          </Secao>

          <label className="flex cursor-pointer items-center gap-2.5 border-t border-ink-100 pt-5 text-sm font-semibold text-ink-800">
            <Checkbox checked={ativo} onChange={(evento) => setAtivo(evento.target.checked)} />
            Cupom ativo
          </label>

          <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-5 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => mudarAbertura(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" loading={enviando}>
              {editando ? 'Salvar alterações' : 'Criar cupom'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
