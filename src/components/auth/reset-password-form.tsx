'use client';

import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { checkPassword, describePasswordProblems } from '@/lib/password-policy';

import { Alert } from '../ui/alert';
import { Button, buttonClasses } from '../ui/button';
import { Field, fieldIds } from '../ui/field';
import { PasswordInput } from '../ui/password-input';
import { PasswordRequirements } from './password-requirements';

export function ResetPasswordForm({ token }: { token: string }) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [linkInvalido, setLinkInvalido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  // Tira o token da barra de endereço: não fica no histórico nem aparece em print de tela.
  useEffect(() => {
    window.history.replaceState(null, '', '/redefinir-senha');
  }, []);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const problemas = checkPassword(senha);
    const novosCampos: Record<string, string> = {};
    if (problemas.length > 0) novosCampos.password = describePasswordProblems(problemas);
    if (senha !== confirmacao) novosCampos.confirmation = 'As duas senhas não são iguais.';
    setCampos(novosCampos);
    if (Object.keys(novosCampos).length > 0) return;

    setEnviando(true);
    try {
      await api('/api/auth/password/reset', { method: 'POST', body: { token, password: senha } });
      setConcluido(true);
    } catch (falha) {
      if (falha instanceof ApiError && falha.code === 'INVALID_RESET_TOKEN') setLinkInvalido(true);
      else if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) setCampos(falha.fields);
      else setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <div className="grid gap-5 animate-rise-in">
        <span className="grid size-12 place-items-center rounded-2xl bg-success-50 text-success-700 ring-1 ring-success-100">
          <CircleCheck className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-900">
            Senha redefinida
          </h1>
          <p className="mt-2 text-[15px] leading-7 text-ink-600">
            Por segurança, encerramos as sessões abertas com a senha antiga. Entre com a nova senha.
          </p>
        </div>
        <Link href="/entrar" className={buttonClasses('primary', 'lg', 'w-full')}>
          Entrar
        </Link>
      </div>
    );
  }

  if (linkInvalido) {
    return (
      <div className="grid gap-5 animate-rise-in">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-900">
          Link expirado
        </h1>
        <Alert tone="warning">
          Este link expirou ou já foi usado. Os links valem por 30 minutos e funcionam uma vez só.
        </Alert>
        <Link href="/recuperar-senha" className={buttonClasses('primary', 'lg', 'w-full')}>
          Pedir um novo link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={salvar} noValidate className="grid gap-5 animate-rise-in">
      <div>
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-900">
          Criar nova senha
        </h1>
        <p className="mt-1 text-[15px] leading-7 text-ink-500">
          Escolha uma senha que você não usa em outros lugares.
        </p>
      </div>

      {erro ? <Alert tone="danger">{erro}</Alert> : null}

      <Field id="nova-senha" label="Nova senha" error={campos.password}>
        <PasswordInput
          id="nova-senha"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          {...fieldIds('nova-senha', { error: campos.password })}
        />
      </Field>
      <PasswordRequirements password={senha} />

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
    </form>
  );
}
