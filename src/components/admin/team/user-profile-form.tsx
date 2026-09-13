'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { formatPhoneBR } from '@/lib/documents';

import { Button } from '../../ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '../../ui/card';
import { Field, fieldIds, Input } from '../../ui/field';

export function UserProfileForm({
  userId,
  initial,
  canEdit,
}: {
  userId: string;
  initial: { name: string; email: string; phone: string | null };
  canEdit: boolean;
}) {
  const router = useRouter();
  const telefoneInicial = initial.phone ? formatPhoneBR(initial.phone) : '';
  const [nome, setNome] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [telefone, setTelefone] = useState(telefoneInicial);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const alterado = nome !== initial.name || email !== initial.email || telefone !== telefoneInicial;

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCampos({});
    setSalvando(true);
    try {
      await api(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: {
          ...(nome !== initial.name ? { name: nome } : {}),
          ...(email !== initial.email ? { email } : {}),
          ...(telefone !== telefoneInicial ? { phone: telefone || null } : {}),
        },
      });
      toast.success('Dados atualizados.');
      router.refresh();
    } catch (falha) {
      if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) setCampos(falha.fields);
      else toast.error(errorMessage(falha));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <form onSubmit={salvar} noValidate>
        <CardHeader title="Dados" description="Nome e contatos usados no sistema e nos avisos." />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="perfil-nome" label="Nome completo" error={campos.name} className="sm:col-span-2">
            <Input
              id="perfil-nome"
              value={nome}
              disabled={!canEdit}
              onChange={(e) => setNome(e.target.value)}
              {...fieldIds('perfil-nome', { error: campos.name })}
            />
          </Field>
          <Field id="perfil-email" label="E-mail de acesso" error={campos.email}>
            <Input
              id="perfil-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              disabled={!canEdit}
              onChange={(e) => setEmail(e.target.value)}
              {...fieldIds('perfil-email', { error: campos.email })}
            />
          </Field>
          <Field id="perfil-telefone" label="Celular" error={campos.phone}>
            <Input
              id="perfil-telefone"
              type="tel"
              inputMode="tel"
              placeholder="(73) 99999-8888"
              value={telefone}
              disabled={!canEdit}
              onChange={(e) => setTelefone(e.target.value)}
              {...fieldIds('perfil-telefone', { error: campos.phone })}
            />
          </Field>
        </CardContent>
        {canEdit ? (
          <CardFooter>
            <Button type="submit" loading={salvando} disabled={!alterado}>
              Salvar dados
            </Button>
          </CardFooter>
        ) : null}
      </form>
    </Card>
  );
}
