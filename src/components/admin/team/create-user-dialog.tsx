'use client';

import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { RoleKey } from '@/lib/access';
import { api, ApiError, errorMessage } from '@/lib/api-client';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogTrigger } from '../../ui/dialog';
import { Field, fieldIds, Input } from '../../ui/field';
import { RoleCheckboxes, type RoleOption } from './role-checkboxes';
import { TemporaryPassword } from './temporary-password';

interface Criado {
  user: { name: string };
  temporaryPassword: string;
}

export function CreateUserDialog({ roleOptions }: { roleOptions: RoleOption[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [papeis, setPapeis] = useState<RoleKey[]>([]);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [criado, setCriado] = useState<Criado | null>(null);

  function limpar() {
    setNome('');
    setEmail('');
    setTelefone('');
    setPapeis([]);
    setCampos({});
    setErro(null);
    setCriado(null);
  }

  function mudarAbertura(novo: boolean) {
    if (enviando) return;
    setAberto(novo);
    if (!novo) {
      if (criado) router.refresh();
      limpar();
    }
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const faltando: Record<string, string> = {};
    if (nome.trim().length < 3) faltando.name = 'Informe o nome completo.';
    if (!email.trim()) faltando.email = 'Informe o e-mail.';
    if (papeis.length === 0) faltando.roles = 'Escolha ao menos um papel.';
    setCampos(faltando);
    if (Object.keys(faltando).length > 0) return;

    setEnviando(true);
    try {
      const resultado = await api<Criado>('/api/admin/users', {
        method: 'POST',
        body: { name: nome, email, phone: telefone || null, roles: papeis },
      });
      setCriado(resultado);
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
          <UserPlus className="size-4" aria-hidden /> Nova pessoa
        </Button>
      </DialogTrigger>

      {criado ? (
        <DialogContent
          title="Acesso criado"
          description={`${criado.user.name} já pode entrar no sistema.`}
          size="sm"
        >
          <TemporaryPassword password={criado.temporaryPassword} personName={criado.user.name} />
          <Button className="mt-5 w-full" onClick={() => mudarAbertura(false)}>
            Concluir
          </Button>
        </DialogContent>
      ) : (
        <DialogContent
          title="Nova pessoa na equipe"
          description="O sistema gera uma senha temporária; no primeiro acesso a pessoa cria a própria."
          size="lg"
        >
          <form onSubmit={salvar} noValidate className="grid gap-5">
            {erro ? <Alert tone="danger">{erro}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="nova-nome"
                label="Nome completo"
                required
                error={campos.name}
                className="sm:col-span-2"
              >
                <Input
                  id="nova-nome"
                  autoComplete="off"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  {...fieldIds('nova-nome', { error: campos.name })}
                />
              </Field>
              <Field id="nova-email" label="E-mail" required error={campos.email}>
                <Input
                  id="nova-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  {...fieldIds('nova-email', { error: campos.email })}
                />
              </Field>
              <Field id="nova-telefone" label="Celular" hint="Opcional, com DDD." error={campos.phone}>
                <Input
                  id="nova-telefone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="(73) 99999-8888"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  {...fieldIds('nova-telefone', { hint: true, error: campos.phone })}
                />
              </Field>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-ink-800">
                Papéis <span className="text-danger-700">*</span>
              </legend>
              <RoleCheckboxes
                options={roleOptions}
                value={papeis}
                onChange={setPapeis}
                idPrefix="nova-papel"
              />
              {campos.roles ? (
                <p className="text-[13px] font-medium text-danger-700">{campos.roles}</p>
              ) : null}
            </fieldset>

            <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => mudarAbertura(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button type="submit" loading={enviando}>
                Criar acesso
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
