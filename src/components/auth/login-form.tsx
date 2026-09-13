'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { api, ApiError, errorMessage } from '@/lib/api-client';

import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, fieldIds, Input } from '../ui/field';
import { PasswordInput } from '../ui/password-input';

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);

    const faltando: Record<string, string> = {};
    if (!email.trim()) faltando.email = 'Informe o e-mail.';
    if (!senha) faltando.password = 'Informe a senha.';
    setCampos(faltando);
    if (Object.keys(faltando).length > 0) return;

    setEnviando(true);
    try {
      const resultado = await api<{ mustChangePassword: boolean }>('/api/auth/login', {
        method: 'POST',
        body: { email, password: senha },
      });
      router.replace(resultado.mustChangePassword ? '/trocar-senha' : next);
      router.refresh();
    } catch (falha) {
      if (falha instanceof ApiError) setCampos(falha.fields);
      setErro(errorMessage(falha));
      setSenha('');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} noValidate className="grid gap-5 animate-rise-in">
      <div>
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.02em] text-ink-900">Entrar</h1>
        <p className="mt-1 text-[15px] text-ink-500">Use o e-mail e a senha do seu acesso de equipe.</p>
      </div>

      {notice && !erro ? <Alert tone="info">{notice}</Alert> : null}
      {erro ? <Alert tone="danger">{erro}</Alert> : null}

      <Field id="email" label="E-mail" error={campos.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...fieldIds('email', { error: campos.email })}
        />
      </Field>

      <Field id="senha" label="Senha" error={campos.password}>
        <PasswordInput
          id="senha"
          name="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          {...fieldIds('senha', { error: campos.password })}
        />
      </Field>

      <div className="-mt-2 flex justify-end">
        <Link href="/recuperar-senha" className="text-sm font-semibold text-pool-700 hover:text-pool-800">
          Esqueci minha senha
        </Link>
      </div>

      <Button type="submit" size="lg" loading={enviando} className="w-full">
        Entrar
      </Button>
    </form>
  );
}
