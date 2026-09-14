'use client';

import { Pencil, Plus, Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { DAY_KIND_LABELS, DAY_KINDS, type DayKind } from '@/lib/pricing';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { Dialog, DialogContent, DialogTrigger } from '../../ui/dialog';
import { Checkbox, Field, fieldIds, Input } from '../../ui/field';
import { MoneyInput } from '../../ui/money-input';

export interface PriceRuleInitial {
  id: string;
  name: string;
  priceCents: number;
  compareAtCents: number | null;
  dayKinds: DayKind[];
  visitFrom: string | null;
  visitUntil: string | null;
  saleFrom: string | null;
  saleUntil: string | null;
  lotQuantity: number | null;
  priority: number;
  isActive: boolean;
  lotSold: number | null;
}

export function PriceRuleDialog({ ticketTypeId, rule }: { ticketTypeId: string; rule?: PriceRuleInitial }) {
  const router = useRouter();
  const editando = Boolean(rule);
  const [aberto, setAberto] = useState(false);
  const [versao, setVersao] = useState(0);

  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState<number | null>(null);
  const [precoDe, setPrecoDe] = useState<number | null>(null);
  const [tiposDeDia, setTiposDeDia] = useState<DayKind[]>([]);
  const [visitaDe, setVisitaDe] = useState('');
  const [visitaAte, setVisitaAte] = useState('');
  const [vendaDe, setVendaDe] = useState('');
  const [vendaAte, setVendaAte] = useState('');
  const [lote, setLote] = useState('');
  const [prioridade, setPrioridade] = useState('0');
  const [ativa, setAtiva] = useState(true);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function mudarAbertura(novo: boolean) {
    if (enviando) return;
    if (novo) {
      setNome(rule?.name ?? '');
      setPreco(rule?.priceCents ?? null);
      setPrecoDe(rule?.compareAtCents ?? null);
      setTiposDeDia(rule?.dayKinds ?? []);
      setVisitaDe(rule?.visitFrom ?? '');
      setVisitaAte(rule?.visitUntil ?? '');
      setVendaDe(rule?.saleFrom ?? '');
      setVendaAte(rule?.saleUntil ?? '');
      setLote(rule?.lotQuantity?.toString() ?? '');
      setPrioridade(String(rule?.priority ?? 0));
      setAtiva(rule?.isActive ?? true);
      setCampos({});
      setErro(null);
      setVersao((atual) => atual + 1);
    }
    setAberto(novo);
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const faltando: Record<string, string> = {};
    if (nome.trim().length < 2) faltando.name = 'Dê um nome para a regra.';
    if (preco === null) faltando.priceCents = 'Informe o preço.';
    const numeroDePrioridade = Number(prioridade);
    if (!Number.isInteger(numeroDePrioridade) || numeroDePrioridade < -100 || numeroDePrioridade > 100) {
      faltando.priority = 'Use um número de -100 a 100.';
    }
    setCampos(faltando);
    if (Object.keys(faltando).length > 0) return;

    setEnviando(true);
    try {
      await api(
        editando ? `/api/admin/prices/${rule?.id}` : `/api/admin/ticket-types/${ticketTypeId}/prices`,
        {
          method: editando ? 'PUT' : 'POST',
          body: {
            name: nome,
            priceCents: preco,
            compareAtCents: precoDe,
            dayKinds: tiposDeDia,
            visitFrom: visitaDe || null,
            visitUntil: visitaAte || null,
            saleFrom: vendaDe || null,
            saleUntil: vendaAte || null,
            lotQuantity: lote.trim() ? Number(lote) : null,
            priority: numeroDePrioridade,
            isActive: ativa,
          },
        },
      );
      toast.success(editando ? 'Regra de preço atualizada.' : 'Regra de preço criada.');
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
        {editando ? (
          <Button variant="ghost" size="sm" aria-label={`Editar regra ${rule?.name}`}>
            <Pencil className="size-3.5" aria-hidden />
            Editar
          </Button>
        ) : (
          <Button variant="secondary">
            <Plus className="size-4" aria-hidden />
            Nova regra de preço
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={editando ? `Editar regra ${rule?.name}` : 'Nova regra de preço'}
        description="A regra vale quando todas as condições preenchidas batem com a compra. Deixe em branco o que não importa."
        size="lg"
      >
        <form onSubmit={salvar} noValidate className="grid gap-5" key={versao}>
          {erro ? <Alert tone="danger">{erro}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id="regra-nome"
              label="Nome da regra"
              required
              error={campos.name}
              className="sm:col-span-3"
            >
              <Input
                id="regra-nome"
                value={nome}
                maxLength={60}
                placeholder="Fim de semana, Feriado, Primeiro lote..."
                onChange={(evento) => setNome(evento.target.value)}
                {...fieldIds('regra-nome', { error: campos.name })}
              />
            </Field>
            <Field id="regra-preco" label="Preço" required error={campos.priceCents}>
              <MoneyInput
                id="regra-preco"
                valueCents={preco}
                onValueChange={setPreco}
                {...fieldIds('regra-preco', { error: campos.priceCents })}
              />
            </Field>
            <Field
              id="regra-preco-de"
              label="Preço riscado"
              hint="Opcional: mostra a promoção."
              error={campos.compareAtCents}
            >
              <MoneyInput
                id="regra-preco-de"
                valueCents={precoDe}
                onValueChange={setPrecoDe}
                {...fieldIds('regra-preco-de', { hint: true, error: campos.compareAtCents })}
              />
            </Field>
            <Field
              id="regra-prioridade"
              label="Prioridade"
              hint="Maior vence quando duas regras valem."
              error={campos.priority}
            >
              <Input
                id="regra-prioridade"
                inputMode="numeric"
                value={prioridade}
                onChange={(evento) => setPrioridade(evento.target.value.replace(/[^\d-]/g, '').slice(0, 4))}
                {...fieldIds('regra-prioridade', { hint: true, error: campos.priority })}
              />
            </Field>
          </div>

          <div className="grid gap-2 border-t border-ink-100 pt-5">
            <p className="text-[13px] font-semibold text-ink-800">Tipos de dia</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_KINDS.map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  aria-pressed={tiposDeDia.includes(tipo)}
                  onClick={() =>
                    setTiposDeDia((atual) =>
                      atual.includes(tipo) ? atual.filter((item) => item !== tipo) : [...atual, tipo],
                    )
                  }
                  className={cn(
                    'h-9 rounded-lg px-3 text-[13px] font-semibold ring-1 ring-inset transition-colors',
                    tiposDeDia.includes(tipo)
                      ? 'bg-pool-700 text-white ring-pool-700'
                      : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                  )}
                >
                  {DAY_KIND_LABELS[tipo]}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-ink-500">
              Nenhum marcado: vale para qualquer dia. Feriado, evento e data especial são marcados no
              calendário.
            </p>
          </div>

          <div className="grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
            <Field id="regra-visita-de" label="Visitas a partir de" error={campos.visitFrom}>
              <Input
                id="regra-visita-de"
                type="date"
                value={visitaDe}
                onChange={(e) => setVisitaDe(e.target.value)}
              />
            </Field>
            <Field id="regra-visita-ate" label="Visitas até" error={campos.visitUntil}>
              <Input
                id="regra-visita-ate"
                type="date"
                value={visitaAte}
                onChange={(e) => setVisitaAte(e.target.value)}
              />
            </Field>
            <Field
              id="regra-venda-de"
              label="Vendido a partir de"
              hint="Dia da compra."
              error={campos.saleFrom}
            >
              <Input
                id="regra-venda-de"
                type="date"
                value={vendaDe}
                onChange={(e) => setVendaDe(e.target.value)}
              />
            </Field>
            <Field
              id="regra-venda-ate"
              label="Vendido até"
              hint="Dia da compra, inclusive."
              error={campos.saleUntil}
            >
              <Input
                id="regra-venda-ate"
                type="date"
                value={vendaAte}
                onChange={(e) => setVendaAte(e.target.value)}
              />
            </Field>
            <Field
              id="regra-lote"
              label="Quantidade do lote"
              hint={
                rule?.lotSold !== null && rule?.lotSold !== undefined
                  ? `${rule.lotSold} já vendidos neste lote. Esgotado, a próxima regra passa a valer.`
                  : 'Opcional. Esgotado, a próxima regra passa a valer.'
              }
              error={campos.lotQuantity}
            >
              <Input
                id="regra-lote"
                inputMode="numeric"
                placeholder="Sem lote"
                value={lote}
                onChange={(evento) => setLote(evento.target.value.replace(/\D/g, '').slice(0, 7))}
                {...fieldIds('regra-lote', { hint: true, error: campos.lotQuantity })}
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2.5 pt-6 text-sm font-semibold text-ink-800">
              <Checkbox checked={ativa} onChange={(evento) => setAtiva(evento.target.checked)} />
              Regra ativa
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-5 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => mudarAbertura(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" loading={enviando}>
              {editando ? 'Salvar regra' : 'Criar regra'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePriceRuleButton({ ruleId, name }: { ruleId: string; name: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAberto(true)} aria-label={`Excluir regra ${name}`}>
        <Trash className="size-3.5" aria-hidden />
        Excluir
      </Button>
      <ConfirmDialog
        open={aberto}
        onOpenChange={setAberto}
        title={`Excluir a regra ${name}?`}
        description="Regra já usada em vendas não pode ser excluída (fica no histórico): nesse caso, desative-a."
        confirmLabel="Excluir regra"
        variant="danger"
        onConfirm={async () => {
          try {
            await api(`/api/admin/prices/${ruleId}`, { method: 'DELETE' });
            toast.success('Regra de preço excluída.');
            router.refresh();
            return true;
          } catch (falha) {
            toast.error(errorMessage(falha));
            return false;
          }
        }}
      />
    </>
  );
}
