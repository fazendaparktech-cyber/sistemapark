'use client';

import { useMemo, useState } from 'react';

import { CopyButton } from '../../ui/copy-button';
import { Field, Input, Select } from '../../ui/field';

function limpar(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Monta links da página de compra com origem da campanha (utm) e, se quiser,
 * com ingresso ou data já escolhidos. O painel mostra depois as vendas por origem.
 */
export function CampaignLinkBuilder({
  baseUrl,
  ticketTypes,
}: {
  baseUrl: string;
  ticketTypes: { slug: string; name: string }[];
}) {
  const [origem, setOrigem] = useState('instagram');
  const [midia, setMidia] = useState('social');
  const [campanha, setCampanha] = useState('');
  const [ingresso, setIngresso] = useState('');
  const [data, setData] = useState('');

  const link = useMemo(() => {
    const url = new URL(baseUrl);
    if (ingresso) url.searchParams.set('ingresso', ingresso);
    if (data) url.searchParams.set('data', data);
    if (limpar(origem)) url.searchParams.set('utm_source', limpar(origem));
    if (limpar(midia)) url.searchParams.set('utm_medium', limpar(midia));
    if (limpar(campanha)) url.searchParams.set('utm_campaign', limpar(campanha));
    return url.toString();
  }, [baseUrl, ingresso, data, origem, midia, campanha]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="campanha-origem" label="Origem" hint="instagram, whatsapp, google...">
          <Input id="campanha-origem" value={origem} onChange={(evento) => setOrigem(evento.target.value)} />
        </Field>
        <Field id="campanha-midia" label="Mídia" hint="social, anuncio, email...">
          <Input id="campanha-midia" value={midia} onChange={(evento) => setMidia(evento.target.value)} />
        </Field>
        <Field id="campanha-nome" label="Campanha" hint="ferias-de-julho, dia-das-criancas...">
          <Input
            id="campanha-nome"
            value={campanha}
            onChange={(evento) => setCampanha(evento.target.value)}
          />
        </Field>
        <Field id="campanha-ingresso" label="Ingresso já selecionado">
          <Select
            id="campanha-ingresso"
            value={ingresso}
            onChange={(evento) => setIngresso(evento.target.value)}
          >
            <option value="">Nenhum</option>
            {ticketTypes.map((tipo) => (
              <option key={tipo.slug} value={tipo.slug}>
                {tipo.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="campanha-data" label="Data já selecionada">
          <Input
            id="campanha-data"
            type="date"
            value={data}
            onChange={(evento) => setData(evento.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-ink-50 px-3.5 py-2.5 font-mono text-[13px] text-ink-800 ring-1 ring-inset ring-ink-200">
          {link}
        </code>
        <CopyButton value={link} label="Copiar link da campanha" className="shrink-0" />
      </div>
    </div>
  );
}
