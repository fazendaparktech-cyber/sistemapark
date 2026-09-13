'use client';

import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { checkPassword, describePasswordProblems } from '@/lib/password-policy';

import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, fieldIds } from '../ui/field';
import { PasswordInput } from '../ui/password-input';
import { LogoutButton } from './logout-button';
import { PasswordRequirements } from './password-requirements';

export function ChangePasswordForm({
  mustChange,
  name,
  email,
}: {
  mustChange: boolean;
  name: string;
  email: string;
}) {
  const router = useRouter();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const primeiroNome = name.trim().split(/\s+/)[0] ?? name;

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const novosCampos: Record<string, string> = {};
    if (!atual) novosCampos.currentPassword = 'Informe a senha atual.';
    const problemas = checkPassword(nova, { email, name });
    if (problemas.length > 0) novosCampos.newPassword = describePasswordProblems(problemas);
    else if (nova === atual) novosCampos.newPassword = 'A nova senha precisa ser diferente da atual.';
    if (nova !== confirmacao) novosCampos.confirmation = 'As duas senhas não são iguais.';
    setCampos(novosCampos);
    if (Object.keys(novosCampos).length > 0) return;

    setEnviando(true);
    try {
      await api('/api/auth/password/change', {
        method: 'POST',
        body: { currentPassword: atual, newPassword: nova },
      });
      toast.success('Senha alterada. As outras sessões abertas foram encerradas.');
      router.replace('/admin');
      router.refresh();
    } catch (falha) {
      if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) setCampos(falha.fields);
      else setErro(errorMessage(falha));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate className="grid gap-5 animate-rise-in">
      <div>
        {mustChange ? (
          <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-grape-50 text-grape-600 ring-1 ring-grape-100">
            <ShieldCheck className="size-6" aria-hidden />
          </span>
        ) : null}
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-900">
          {mustChange ? `Olá, ${primeiroNome}` : 'Trocar senha'}
        </h1>
        <p className="mt-1 text-[15px] leading-7 text-ink-500">
          {mustChange
            ? 'Por segurança, troque a senha temporária por uma senha só sua antes de continuar.'
            : 'Ao trocar, as outras sessões abertas com a sua conta são encerradas.'}
        </p>
      </div>

      {erro ? <Alert tone="danger">{erro}</Alert> : null}

      <Field
        id="senha-atual"
        label={mustChange ? 'Senha temporária' : 'Senha atual'}
        error={campos.currentPassword}
      >
        <PasswordInput
          id="senha-atual"
          autoComplete="current-password"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          {...fieldIds('senha-atual', { error: campos.currentPassword })}
        />
      </Field>

      <Field id="nova-senha" label="Nova senha" error={campos.newPassword}>
        <PasswordInput
          id="nova-senha"
          autoComplete="new-password"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          {...fieldIds('nova-senha', { error: campos.newPassword })}
        />
      </Field>
      <PasswordRequirements password={nova} email={email} name={name} />

      <Field id="confirmacao" label="Repita a nova senha" error={campos.confirmation}>
        <PasswordInput
          id="confirmacao"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          {...fieldIds('confirmacao', { error: campos.confirmation })}
        />
      </Field>

      <Button type="submit" size="lg" loading={enviando} className="w-full">
        Salvar nova senha
      </Button>

      <div className="flex items-center justify-between text-sm">
        {mustChange ? (
          <span className="text-ink-500">Entrou com a conta errada?</span>
        ) : (
          <Link href="/admin" className="font-semibold text-pool-700 hover:text-pool-800">
            Voltar ao painel
          </Link>
        )}
        <LogoutButton size="sm" />
      </div>
    </form>
  );
}
