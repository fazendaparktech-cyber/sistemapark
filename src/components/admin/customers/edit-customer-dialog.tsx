'use client';

import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { formatPhoneBR } from '@/lib/documents';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogTrigger } from '../../ui/dialog';
import { Checkbox, Field, fieldIds, Input, Textarea } from '../../ui/field';

export interface EditableCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  marketingOptIn: boolean;
  notes: string | null;
}

export function EditCustomerDialog({ customer }: { customer: EditableCustomer }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? '');
  const [telefone, setTelefone] = useState(customer.phone ? formatPhoneBR(customer.phone) : '');
  const [nascimento, setNascimento] = useState(customer.birthDate ?? '');
  const [comunicacoes, setComunicacoes] = useState(customer.marketingOptIn);
  const [observacoes, setObservacoes] = useState(customer.notes ?? '');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function mudarAbertura(novo: boolean) {
    if (enviando) return;
    setAberto(novo);
    if (novo) {
      setNome(customer.name);
      setEmail(customer.email ?? '');
      setTelefone(customer.phone ? formatPhoneBR(customer.phone) : '');
      setNascimento(customer.birthDate ?? '');
      setComunicacoes(customer.marketingOptIn);
      setObservacoes(customer.notes ?? '');
      setCampos({});
      setErro(null);
    }
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const faltando: Record<string, string> = {};
    if (nome.trim().length < 3) faltando.name = 'Informe o nome completo.';
    if (!email.trim()) faltando.email = 'Informe o e-mail.';
    setCampos(faltando);
    if (Object.keys(faltando).length > 0) return;

    setEnviando(true);
    try {
      await api(`/api/admin/customers/${customer.id}`, {
        method: 'PUT',
        body: {
          name: nome,
          email,
          phone: telefone || null,
          birthDate: nascimento || null,
          marketingOptIn: comunicacoes,
          notes: observacoes || null,
        },
      });
      toast.success('Cadastro do cliente atualizado.');
      setAberto(false);
      router.refresh();
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
        <Button variant="secondary">
          <Pencil className="size-4" aria-hidden />
          Editar cadastro
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Editar cadastro do cliente"
        description="O CPF não pode ser alterado: é ele que identifica o cliente nas compras."
        size="lg"
      >
        <form onSubmit={salvar} noValidate className="grid gap-5">
          {erro ? <Alert tone="danger">{erro}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="cliente-nome"
              label="Nome completo"
              required
              error={campos.name}
              className="sm:col-span-2"
            >
              <Input
                id="cliente-nome"
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                {...fieldIds('cliente-nome', { error: campos.name })}
              />
            </Field>
            <Field id="cliente-email" label="E-mail" required error={campos.email}>
              <Input
                id="cliente-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                {...fieldIds('cliente-email', { error: campos.email })}
              />
            </Field>
            <Field id="cliente-telefone" label="Celular" error={campos.phone}>
              <Input
                id="cliente-telefone"
                type="tel"
                inputMode="tel"
                placeholder="(73) 99999-8888"
                value={telefone}
                onChange={(evento) => setTelefone(evento.target.value)}
                {...fieldIds('cliente-telefone', { error: campos.phone })}
              />
            </Field>
            <Field id="cliente-nascimento" label="Data de nascimento" error={campos.birthDate}>
              <Input
                id="cliente-nascimento"
                type="date"
                value={nascimento}
                onChange={(evento) => setNascimento(evento.target.value)}
                {...fieldIds('cliente-nascimento', { error: campos.birthDate })}
              />
            </Field>
            <div className="flex items-end pb-2.5">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-800">
                <Checkbox
                  checked={comunicacoes}
                  onChange={(evento) => setComunicacoes(evento.target.checked)}
                  className="mt-0.5"
                />
                Aceita receber novidades e promoções
              </label>
            </div>
            <Field
              id="cliente-observacoes"
              label="Observações internas"
              hint="Só a equipe vê. Não registre dados de saúde nem documentos."
              error={campos.notes}
              className="sm:col-span-2"
            >
              <Textarea
                id="cliente-observacoes"
                maxLength={2000}
                value={observacoes}
                onChange={(evento) => setObservacoes(evento.target.value)}
                {...fieldIds('cliente-observacoes', { hint: true, error: campos.notes })}
              />
            </Field>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-5 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => mudarAbertura(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" loading={enviando}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
