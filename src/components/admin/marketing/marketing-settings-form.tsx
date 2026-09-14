'use client';

import { CircleCheck, CircleDashed } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import { MARKETING_INTEGRATIONS, type MarketingSettings } from '@/lib/marketing';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Field, fieldIds, Input } from '../../ui/field';

type Valores = Record<keyof MarketingSettings, string>;

/** IDs dos pixels de anúncio e análise. Vazio desliga o pixel. */
export function MarketingSettingsForm({
  values,
  canManage,
}: {
  values: MarketingSettings;
  canManage: boolean;
}) {
  const router = useRouter();
  const [campos, setCampos] = useState<Valores>(() => ({
    metaPixelId: values.metaPixelId ?? '',
    tiktokPixelId: values.tiktokPixelId ?? '',
    googleAnalyticsId: values.googleAnalyticsId ?? '',
    googleAdsId: values.googleAdsId ?? '',
    googleAdsPurchaseLabel: values.googleAdsPurchaseLabel ?? '',
  }));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!canManage) {
    return (
      <ul className="divide-y divide-ink-100">
        {MARKETING_INTEGRATIONS.map((item) => {
          const valor = values[item.key];
          return (
            <li key={item.key} className="flex items-start justify-between gap-4 py-3 text-sm">
              <span className="text-ink-700">{item.label}</span>
              {valor ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-success-700">
                  <CircleCheck className="size-4" aria-hidden />
                  <span className="font-mono text-[13px]">{valor}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-ink-500">
                  <CircleDashed className="size-4" aria-hidden />
                  Não configurado
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setErros({});
    setEnviando(true);
    try {
      await api('/api/admin/marketing/settings', {
        method: 'PUT',
        body: Object.fromEntries(
          Object.entries(campos).map(([chave, valor]) => [chave, valor.trim() ? valor.trim() : null]),
        ),
      });
      toast.success('Pixels salvos. Já valem para as próximas visitas ao site.');
      router.refresh();
    } catch (falha) {
      if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) setErros(falha.fields);
      else setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate className="grid gap-4">
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {MARKETING_INTEGRATIONS.map((item) => {
          const id = `pixel-${item.key}`;
          return (
            <Field key={item.key} id={id} label={item.label} hint={item.hint} error={erros[item.key]}>
              <Input
                id={id}
                value={campos[item.key]}
                placeholder={item.example}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                onChange={(evento) => setCampos((atuais) => ({ ...atuais, [item.key]: evento.target.value }))}
                {...fieldIds(id, { hint: true, error: erros[item.key] })}
              />
            </Field>
          );
        })}
      </div>
      <p className="text-[13px] leading-5 text-ink-500">
        Os pixels carregam só nas páginas do site de vendas, nunca no painel. O endereço do pedido vai sem o
        código de acesso do cliente. Compra realizada é enviada uma vez, com o valor e o número do pedido.
      </p>
      <div className="flex justify-end">
        <Button type="submit" loading={enviando}>
          Salvar pixels
        </Button>
      </div>
    </form>
  );
}
