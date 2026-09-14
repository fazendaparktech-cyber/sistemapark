'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { FINANCE_CATEGORIES, type FinanceEntryTypeKey } from '@/lib/finance-entries';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { Dialog, DialogContent, DialogTrigger } from '../../ui/dialog';
import { Field, Input, Select, Textarea } from '../../ui/field';
import { MoneyInput } from '../../ui/money-input';

export interface FinanceEntryFormValues {
  id: string;
  type: FinanceEntryTypeKey;
  category: string;
  description: string;
  amountCents: number;
  date: string;
  paid: boolean;
  notes: string | null;
}

const OPCAO = 'h-10 rounded-xl text-sm font-semibold ring-1 ring-inset transition-colors';
const OPCAO_LIVRE = 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50';

function Formulario({
  inicial,
  today,
  onDone,
}: {
  inicial: FinanceEntryFormValues | null;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<FinanceEntryTypeKey>(inicial?.type ?? 'EXPENSE');
  const [categoria, setCategoria] = useState(inicial?.category ?? '');
  const [descricao, setDescricao] = useState(inicial?.description ?? '');
  const [valor, setValor] = useState<number | null>(inicial?.amountCents ?? null);
  const [data, setData] = useState(inicial?.date ?? today);
  const [pago, setPago] = useState(inicial?.paid ?? true);
  const [observacoes, setObservacoes] = useState(inicial?.notes ?? '');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const receita = tipo === 'INCOME';

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setCampos({});
    setEnviando(true);
    const body = {
      type: tipo,
      category: categoria,
      description: descricao,
      amountCents: valor ?? 0,
      date: data,
      paid: pago,
      notes: observacoes || null,
    };
    try {
      if (inicial) await api(`/api/admin/finance/entries/${inicial.id}`, { method: 'PUT', body });
      else await api('/api/admin/finance/entries', { method: 'POST', body });
      toast.success(inicial ? 'Lançamento alterado.' : 'Lançamento registrado.');
      onDone();
      router.refresh();
    } catch (falha) {
      if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) setCampos(falha.fields);
      else setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate className="grid gap-5">
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <div role="radiogroup" aria-label="Tipo do lançamento" className="grid grid-cols-2 gap-2">
        {(
          [
            ['EXPENSE', 'Despesa', 'bg-danger-50 text-danger-800 ring-danger-600'],
            ['INCOME', 'Receita', 'bg-success-50 text-success-800 ring-success-600'],
          ] as const
        ).map(([valorDoTipo, texto, marcado]) => (
          <button
            key={valorDoTipo}
            type="button"
            role="radio"
            aria-checked={tipo === valorDoTipo}
            onClick={() => {
              if (tipo === valorDoTipo) return;
              setTipo(valorDoTipo);
              setCategoria('');
            }}
            className={cn(OPCAO, tipo === valorDoTipo ? marcado : OPCAO_LIVRE)}
          >
            {texto}
          </button>
        ))}
      </div>
      <Field id="lancamento-descricao" label="Descrição" required error={campos.description}>
        <Input
          id="lancamento-descricao"
          value={descricao}
          maxLength={120}
          placeholder={receita ? 'Ex.: Vendas do bar no fim de semana' : 'Ex.: Conta de energia de setembro'}
          onChange={(evento) => setDescricao(evento.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="lancamento-categoria" label="Categoria" required error={campos.category}>
          <Select
            id="lancamento-categoria"
            value={categoria}
            onChange={(evento) => setCategoria(evento.target.value)}
          >
            <option value="">Escolha</option>
            {FINANCE_CATEGORIES[tipo].map((opcao) => (
              <option key={opcao.key} value={opcao.key}>
                {opcao.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="lancamento-valor" label="Valor" required error={campos.amountCents}>
          <MoneyInput
            id="lancamento-valor"
            placeholder="R$ 0,00"
            valueCents={valor}
            onValueChange={setValor}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="lancamento-data" label="Data" required error={campos.date}>
          <Input
            id="lancamento-data"
            type="date"
            value={data}
            onChange={(evento) => setData(evento.target.value)}
          />
        </Field>
        <div className="grid content-start gap-1.5">
          <p className="text-[13px] font-semibold text-ink-800">Situação</p>
          <div role="radiogroup" aria-label="Situação" className="grid grid-cols-2 gap-2">
            {(
              [
                [true, receita ? 'Recebido' : 'Pago'],
                [false, receita ? 'A receber' : 'A pagar'],
              ] as const
            ).map(([valorPago, texto]) => (
              <button
                key={texto}
                type="button"
                role="radio"
                aria-checked={pago === valorPago}
                onClick={() => setPago(valorPago)}
                className={cn(
                  OPCAO,
                  pago === valorPago ? 'bg-pool-50 text-pool-800 ring-pool-600' : OPCAO_LIVRE,
                )}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Field id="lancamento-observacoes" label="Observações" error={campos.notes}>
        <Textarea
          id="lancamento-observacoes"
          value={observacoes}
          maxLength={500}
          rows={2}
          onChange={(evento) => setObservacoes(evento.target.value)}
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-5 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" loading={enviando}>
          {inicial ? 'Salvar alterações' : 'Registrar lançamento'}
        </Button>
      </div>
    </form>
  );
}

/** Botão "Novo lançamento" com o formulário de receita ou despesa. */
export function FinanceEntryDialog({ today }: { today: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          Novo lançamento
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Novo lançamento"
        description="Registre uma despesa do parque ou uma receita fora da venda de ingressos."
        size="md"
      >
        {aberto ? <Formulario inicial={null} today={today} onDone={() => setAberto(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Editar e excluir um lançamento da lista. */
export function FinanceEntryActions({ entry, today }: { entry: FinanceEntryFormValues; today: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    try {
      await api(`/api/admin/finance/entries/${entry.id}`, { method: 'DELETE' });
      toast.success('Lançamento excluído.');
      router.refresh();
    } catch (falha) {
      toast.error(errorMessage(falha));
      return false;
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Editar ${entry.description}`}
        onClick={() => setEditando(true)}
      >
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Excluir ${entry.description}`}
        onClick={() => setExcluindo(true)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent title="Editar lançamento" size="md">
          {editando ? <Formulario inicial={entry} today={today} onDone={() => setEditando(false)} /> : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={excluindo}
        onOpenChange={setExcluindo}
        title="Excluir lançamento?"
        description={`"${entry.description}" sai do financeiro. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={excluir}
      />
    </div>
  );
}
