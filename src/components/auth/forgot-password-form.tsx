'use client';

import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { api, ApiError, errorMessage } from '@/lib/api-client';

import { Alert } from '../ui/alert';
import { Button, buttonClasses } from '../ui/button';
import { Field, fieldIds, Input } from '../ui/field';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [erroCampo, setErroCampo] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setErroCampo(undefined);
    if (!email.trim()) {
      setErroCampo('Informe o e-mail.');
      return;
    }
    setEnviando(true);
    try {
      await api('/api/auth/password/forgot', { method: 'POST', body: { email } });
      setEnviadoPara(email.trim().toLowerCase());
    } catch (falha) {
      if (falha instanceof ApiError && falha.fields.email) setErroCampo(falha.fields.email);
      else setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  if (enviadoPara) {
    return (
      <div className="grid gap-5 animate-rise-in">
        <span className="grid size-12 place-items-center rounded-2xl bg-pool-50 text-pool-700 ring-1 ring-pool-100">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-900">
            Confira seu e-mail
          </h1>
          <p className="mt-2 text-[15px] leading-7 text-ink-600">
            Se houver um acesso com <strong className="font-semibold text-ink-900">{enviadoPara}</strong>,
            enviamos um link para criar uma nova senha. O link vale por 30 minutos e só pode ser usado uma
            vez.
          </p>
          <p className="mt-3 text-sm text-ink-500">
            Não chegou? Veja a caixa de spam ou peça de novo em alguns minutos.
          </p>
        </div>
        <Link href="/entrar" className={buttonClasses('secondary', 'lg', 'w-full')}>
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-5 animate-rise-in">
      <div>
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-900">
          Esqueci minha senha
        </h1>
        <p className="mt-1 text-[15px] leading-7 text-ink-500">
          Informe o e-mail do seu acesso. Você recebe um link para criar uma senha nova.
        </p>
      </div>

      {erro ? <Alert tone="danger">{erro}</Alert> : null}

      <Field id="email" label="E-mail" error={erroCampo}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...fieldIds('email', { error: erroCampo })}
        />
      </Field>

      <Button type="submit" size="lg" loading={enviando} className="w-full">
        Enviar link
      </Button>
      <Link href="/entrar" className="text-center text-sm font-semibold text-pool-700 hover:text-pool-800">
        Voltar para o login
      </Link>
    </form>
  );
}
