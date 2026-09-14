'use client';

import { Pencil, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { formatCpfInput, formatPhoneBR } from '@/lib/documents';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogTrigger } from '../../ui/dialog';
import { Checkbox, Field, fieldIds, Input, Textarea } from '../../ui/field';

export interface EditableCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfMasked: string | null;
  birthDate: string | null;
  marketingOptIn: boolean;
  notes: string | null;
}

/** Formulário único de cadastro e edição do cliente. */
function FormularioDoCliente({
  customer,
  onDone,
  onCancel,
}: {
  customer: EditableCustomer | null;
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const [nome, setNome] = useState(customer?.name ?? '');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [telefone, setTelefone] = useState(customer?.phone ? formatPhoneBR(customer.phone) : '');
  const [nascimento, setNascimento] = useState(customer?.birthDate ?? '');
  const [comunicacoes, setComunicacoes] = useState(customer?.marketingOptIn ?? false);
  const [observacoes, setObservacoes] = useState(customer?.notes ?? '');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [existente, setExistente] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setExistente(null);
    if (nome.trim().length < 3) {
      setCampos({ name: 'Informe o nome completo.' });
      return;
    }
    setCampos({});
    setEnviando(true);
    const corpo = {
      name: nome,
      cpf: customer?.cpfMasked ? null : cpf || null,
      email: email || null,
      phone: telefone || null,
      birthDate: nascimento || null,
      marketingOptIn: comunicacoes,
      notes: observacoes || null,
    };
    try {
      if (customer) {
        await api(`/api/admin/customers/${customer.id}`, { method: 'PUT', body: corpo });
        toast.success('Cadastro do cliente atualizado.');
        onDone(customer.id);
      } else {
        const criado = await api<{ id: string }>('/api/admin/customers', { method: 'POST', body: corpo });
        toast.success('Cliente cadastrado.');
        onDone(criado.id);
      }
    } catch (falha) {
      if (falha instanceof ApiError) {
        setCampos(falha.fields);
        if (typeof falha.details.customerId === 'string') setExistente(falha.details.customerId);
      }
      setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate className="grid gap-5">
      {erro ? (
        <Alert tone="danger">
          {erro}
          {existente ? (
            <>
              {' '}
              <Link href={`/admin/clientes/${existente}`} className="font-semibold underline">
                Abrir cadastro existente
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cliente-nome" label="Nome completo" required error={campos.name} className="sm:col-span-2">
          <Input
            id="cliente-nome"
            value={nome}
            autoComplete="off"
            onChange={(evento) => setNome(evento.target.value)}
            {...fieldIds('cliente-nome', { error: campos.name })}
          />
        </Field>
        {customer?.cpfMasked ? (
          <Field id="cliente-cpf" label="CPF" hint="Não pode ser trocado: identifica o cliente nas compras.">
            <Input
              id="cliente-cpf"
              value={customer.cpfMasked}
              disabled
              {...fieldIds('cliente-cpf', { hint: true })}
            />
          </Field>
        ) : (
          <Field
            id="cliente-cpf"
            label="CPF"
            hint="Opcional. Junta as compras do cliente."
            error={campos.cpf}
          >
            <Input
              id="cliente-cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(evento) => setCpf(formatCpfInput(evento.target.value))}
              {...fieldIds('cliente-cpf', { hint: true, error: campos.cpf })}
            />
          </Field>
        )}
        <Field id="cliente-telefone" label="WhatsApp" error={campos.phone}>
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
        <Field id="cliente-email" label="E-mail" error={campos.email}>
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
        <Field id="cliente-nascimento" label="Data de nascimento" error={campos.birthDate}>
          <Input
            id="cliente-nascimento"
            type="date"
            value={nascimento}
            onChange={(evento) => setNascimento(evento.target.value)}
            {...fieldIds('cliente-nascimento', { error: campos.birthDate })}
          />
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-800 sm:col-span-2">
          <Checkbox
            checked={comunicacoes}
            onChange={(evento) => setComunicacoes(evento.target.checked)}
            className="mt-0.5"
          />
          Aceita receber novidades e promoções
        </label>
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
        <Button variant="secondary" onClick={onCancel} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" loading={enviando}>
          {customer ? 'Salvar alterações' : 'Cadastrar cliente'}
        </Button>
      </div>
    </form>
  );
}

export function EditCustomerDialog({ customer }: { customer: EditableCustomer }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil className="size-4" aria-hidden />
          Editar cadastro
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Editar cadastro do cliente"
        description="Nome, contato e preferências. O CPF, depois de informado, não muda."
        size="lg"
      >
        {aberto ? (
          <FormularioDoCliente
            customer={customer}
            onCancel={() => setAberto(false)}
            onDone={() => {
              setAberto(false);
              router.refresh();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function NewCustomerDialog() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" aria-hidden />
          Novo cliente
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Novo cliente"
        description="Só o nome é obrigatório. Com CPF, as próximas compras do cliente entram neste cadastro."
        size="lg"
      >
        {aberto ? (
          <FormularioDoCliente
            customer={null}
            onCancel={() => setAberto(false)}
            onDone={(id) => {
              setAberto(false);
              router.push(`/admin/clientes/${id}`);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
