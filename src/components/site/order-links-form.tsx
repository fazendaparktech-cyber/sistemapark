'use client';

import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { api, errorMessage } from '@/lib/api-client';

import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, fieldIds, Input } from '../ui/field';

export function OrderLinksForm() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!email.includes('@')) {
      setErro('Informe o e-mail usado na compra.');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await api('/api/public/order-links', { method: 'POST', body: { email } });
      setEnviado(email.trim().toLowerCase());
    } catch (falha) {
      setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="grid gap-4 text-center">
        <MailCheck className="mx-auto size-10 text-success-700" aria-hidden />
        <p className="text-lg font-semibold text-ink-900">Confira seu e-mail</p>
        <p className="text-ink-600">
          Se houver pedidos feitos com <span className="font-semibold text-ink-900">{enviado}</span> nos
          últimos seis meses, enviamos agora os links para ver os ingressos. Olhe também a caixa de spam e
          promoções.
        </p>
        <Button variant="secondary" onClick={() => setEnviado(null)} className="mx-auto">
          Usar outro e-mail
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-4">
      <Field id="meus-ingressos-email" label="E-mail usado na compra" error={erro}>
        <Input
          id="meus-ingressos-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          {...fieldIds('meus-ingressos-email', { error: erro })}
        />
      </Field>
      <Button type="submit" variant="cta" size="lg" loading={enviando}>
        Receber os links por e-mail
      </Button>
      <Alert tone="info">
        Por segurança, os ingressos só são enviados para o e-mail informado na compra.
      </Alert>
    </form>
  );
}
