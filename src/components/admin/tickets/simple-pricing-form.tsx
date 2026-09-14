'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { formatDateBR } from '@/lib/dates';
import { formatBRL } from '@/lib/money';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Checkbox, Field, fieldIds, Input } from '../../ui/field';
import { MoneyInput } from '../../ui/money-input';

export interface SimplePricingValues {
  basePriceCents: number;
  weekendPriceCents: number | null;
  holidayPriceCents: number | null;
  promo: { priceCents: number; from: string | null; until: string | null; active: boolean } | null;
}

function periodo(de: string | null, ate: string | null): string {
  if (de && ate) return `de ${formatDateBR(de)} a ${formatDateBR(ate)}`;
  if (de) return `a partir de ${formatDateBR(de)}`;
  if (ate) return `até ${formatDateBR(ate)}`;
  return 'sem data para acabar';
}

/** Preços do dia a dia: semana, fim de semana, feriado e valor promocional. */
export function SimplePricingForm({
  ticketTypeId,
  values,
  canManage,
}: {
  ticketTypeId: string;
  values: SimplePricingValues;
  canManage: boolean;
}) {
  const router = useRouter();
  const [base, setBase] = useState<number | null>(values.basePriceCents);
  const [fimDeSemana, setFimDeSemana] = useState(values.weekendPriceCents);
  const [feriado, setFeriado] = useState(values.holidayPriceCents);
  const [comPromocao, setComPromocao] = useState(values.promo !== null);
  const [promocao, setPromocao] = useState<number | null>(values.promo?.priceCents ?? null);
  const [promocaoDe, setPromocaoDe] = useState(values.promo?.from ?? '');
  const [promocaoAte, setPromocaoAte] = useState(values.promo?.until ?? '');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!canManage) {
    return (
      <dl className="divide-y divide-ink-100">
        {[
          { rotulo: 'Dias de semana', valor: formatBRL(values.basePriceCents) },
          {
            rotulo: 'Fim de semana',
            valor: values.weekendPriceCents !== null ? formatBRL(values.weekendPriceCents) : 'Preço normal',
          },
          {
            rotulo: 'Feriado',
            valor: values.holidayPriceCents !== null ? formatBRL(values.holidayPriceCents) : 'Preço normal',
          },
          {
            rotulo: 'Valor promocional',
            valor: values.promo
              ? `${formatBRL(values.promo.priceCents)}, ${periodo(values.promo.from, values.promo.until)}`
              : 'Sem promoção',
          },
        ].map((linha) => (
          <div key={linha.rotulo} className="flex items-start justify-between gap-4 py-2.5 text-sm">
            <dt className="text-ink-500">{linha.rotulo}</dt>
            <dd className="tabular text-right font-medium text-ink-900">{linha.valor}</dd>
          </div>
        ))}
      </dl>
    );
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const faltando: Record<string, string> = {};
    if (base === null) faltando.basePriceCents = 'Informe o preço dos dias de semana.';
    if (comPromocao && promocao === null) faltando['promo.priceCents'] = 'Informe o valor promocional.';
    setCampos(faltando);
    if (Object.keys(faltando).length > 0) return;

    setEnviando(true);
    try {
      await api(`/api/admin/ticket-types/${ticketTypeId}/simple-prices`, {
        method: 'PUT',
        body: {
          basePriceCents: base,
          weekendPriceCents: fimDeSemana,
          holidayPriceCents: feriado,
          promo: comPromocao
            ? { priceCents: promocao, from: promocaoDe || null, until: promocaoAte || null }
            : null,
        },
      });
      toast.success('Preços salvos.');
      router.refresh();
    } catch (falha) {
      if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) setCampos(falha.fields);
      else setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate className="grid gap-4">
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <Field
        id="preco-semana"
        label="Dias de semana"
        required
        hint="Preço normal do ingresso."
        error={campos.basePriceCents}
      >
        <MoneyInput
          id="preco-semana"
          valueCents={base}
          onValueChange={setBase}
          {...fieldIds('preco-semana', { hint: true, error: campos.basePriceCents })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="preco-fim-de-semana"
          label="Fim de semana"
          hint="Vazio: preço normal."
          error={campos.weekendPriceCents}
        >
          <MoneyInput
            id="preco-fim-de-semana"
            valueCents={fimDeSemana}
            onValueChange={setFimDeSemana}
            placeholder="Preço normal"
            {...fieldIds('preco-fim-de-semana', { hint: true, error: campos.weekendPriceCents })}
          />
        </Field>
        <Field
          id="preco-feriado"
          label="Feriado"
          hint="Dias marcados como feriado no calendário."
          error={campos.holidayPriceCents}
        >
          <MoneyInput
            id="preco-feriado"
            valueCents={feriado}
            onValueChange={setFeriado}
            placeholder="Preço normal"
            {...fieldIds('preco-feriado', { hint: true, error: campos.holidayPriceCents })}
          />
        </Field>
      </div>

      <div className="grid gap-3 rounded-xl p-3.5 ring-1 ring-inset ring-ink-200">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm font-semibold text-ink-800">
          <Checkbox
            checked={comPromocao}
            onChange={(evento) => setComPromocao(evento.target.checked)}
            className="mt-0.5"
          />
          <span>
            Valor promocional
            <span className="block text-[13px] font-normal text-ink-500">
              Vale para compras feitas no período, em qualquer data de visita. O preço normal aparece riscado.
            </span>
          </span>
        </label>
        {comPromocao ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="preco-promocao" label="Valor" required error={campos['promo.priceCents']}>
              <MoneyInput
                id="preco-promocao"
                valueCents={promocao}
                onValueChange={setPromocao}
                {...fieldIds('preco-promocao', { error: campos['promo.priceCents'] })}
              />
            </Field>
            <Field id="preco-promocao-de" label="Vender de" error={campos['promo.from']}>
              <Input
                id="preco-promocao-de"
                type="date"
                value={promocaoDe}
                onChange={(evento) => setPromocaoDe(evento.target.value)}
              />
            </Field>
            <Field id="preco-promocao-ate" label="Até" error={campos['promo.until']}>
              <Input
                id="preco-promocao-ate"
                type="date"
                value={promocaoAte}
                onChange={(evento) => setPromocaoAte(evento.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={enviando}>
          Salvar preços
        </Button>
      </div>
    </form>
  );
}
