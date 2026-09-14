'use client';

import { ImageUp, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, errorMessage } from '@/lib/api-client';
import { PARK_LOGO_MAX_BYTES, type OperationsSettings } from '@/lib/settings';
import { WEEKDAY_LABELS } from '@/lib/weekdays';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { Checkbox, Field, fieldIds, Input } from '../../ui/field';
import { Rodape, useEnvio } from './settings-forms';

// ─── Funcionamento ──────────────────────────────────────────────────────────

export function OperationsSettingsForm({
  initial,
  canManage,
}: {
  initial: OperationsSettings;
  canManage: boolean;
}) {
  const [dias, setDias] = useState<number[]>(initial.openWeekdays);
  const [abre, setAbre] = useState(initial.opensAt);
  const [fecha, setFecha] = useState(initial.closesAt);
  const [capacidade, setCapacidade] = useState(String(initial.capacity));
  const { campos, erro, enviando, enviar } = useEnvio<OperationsSettings>(
    '/api/admin/settings/operations',
    'Funcionamento padrão salvo.',
  );

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void enviar({ openWeekdays: dias, opensAt: abre, closesAt: fecha, capacity: Number(capacidade) });
  }

  return (
    <form onSubmit={salvar} noValidate className="grid gap-5">
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <fieldset disabled={!canManage} className="grid gap-5">
        <div>
          <p className="text-[13px] font-semibold text-ink-800">Dias em que o parque costuma abrir</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((rotulo, indice) => (
              <label
                key={rotulo}
                className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-800 ring-1 ring-inset ring-ink-200 has-[:checked]:bg-pool-50 has-[:checked]:ring-pool-300"
              >
                <Checkbox
                  checked={dias.includes(indice)}
                  onChange={(evento) =>
                    setDias((atuais) =>
                      evento.target.checked ? [...atuais, indice] : atuais.filter((dia) => dia !== indice),
                    )
                  }
                />
                {rotulo}
              </label>
            ))}
          </div>
          {campos.openWeekdays ? (
            <p className="mt-1.5 text-[13px] font-medium text-danger-700">{campos.openWeekdays}</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="funcionamento-abre" label="Abre às" error={campos.opensAt}>
            <Input
              id="funcionamento-abre"
              type="time"
              value={abre}
              onChange={(evento) => setAbre(evento.target.value)}
              {...fieldIds('funcionamento-abre', { error: campos.opensAt })}
            />
          </Field>
          <Field id="funcionamento-fecha" label="Fecha às" error={campos.closesAt}>
            <Input
              id="funcionamento-fecha"
              type="time"
              value={fecha}
              onChange={(evento) => setFecha(evento.target.value)}
              {...fieldIds('funcionamento-fecha', { error: campos.closesAt })}
            />
          </Field>
          <Field
            id="funcionamento-capacidade"
            label="Capacidade por dia"
            hint="Pessoas no parque."
            error={campos.capacity}
          >
            <Input
              id="funcionamento-capacidade"
              inputMode="numeric"
              value={capacidade}
              onChange={(evento) => setCapacidade(evento.target.value.replace(/\D/g, '').slice(0, 6))}
              {...fieldIds('funcionamento-capacidade', { hint: true, error: campos.capacity })}
            />
          </Field>
        </div>
      </fieldset>
      <Rodape enviando={enviando} podeSalvar={canManage}>
        O calendário usa estes valores ao abrir dias. Dias já configurados não mudam.
      </Rodape>
    </form>
  );
}

// ─── Logo ───────────────────────────────────────────────────────────────────

const TIPOS_DE_LOGO = ['image/png', 'image/jpeg', 'image/webp'];

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}

export function ParkLogoForm({
  parkName,
  logoVersion,
  canManage,
}: {
  parkName: string;
  logoVersion: number | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviarArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    if (!TIPOS_DE_LOGO.includes(arquivo.type)) {
      setErro('Use uma imagem PNG, JPEG ou WebP.');
      return;
    }
    if (arquivo.size > PARK_LOGO_MAX_BYTES) {
      setErro('A imagem passa de 300 KB. Exporte em tamanho menor.');
      return;
    }
    setEnviando(true);
    try {
      await api('/api/admin/settings/logo', {
        method: 'PUT',
        body: { dataUrl: await lerComoDataUrl(arquivo) },
      });
      toast.success('Logo atualizada. Já aparece no site.');
      router.refresh();
    } catch (falha) {
      setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  async function remover() {
    try {
      await api('/api/admin/settings/logo', { method: 'DELETE' });
      toast.success('Logo removida. O site volta a usar a marca padrão.');
      router.refresh();
      return true;
    } catch (falha) {
      toast.error(errorMessage(falha));
      return false;
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="grid h-24 w-full shrink-0 place-items-center rounded-2xl bg-ink-50 p-3 ring-1 ring-inset ring-ink-200 sm:w-56">
        {logoVersion ? (
          <Image
            src={`/api/public/park-logo?v=${logoVersion}`}
            alt={`Logo de ${parkName}`}
            width={240}
            height={96}
            unoptimized
            className="h-full w-auto object-contain"
          />
        ) : (
          <span className="text-center text-[13px] text-ink-500">
            Sem logo enviada: o site usa a marca padrão.
          </span>
        )}
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-ink-900">Logo do parque</p>
        <p className="text-[13px] text-ink-500">
          PNG, JPEG ou WebP de até 300 KB, de preferência com fundo transparente. Aparece no topo do site.
        </p>
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={entrada}
              type="file"
              accept={TIPOS_DE_LOGO.join(',')}
              aria-label="Arquivo da logo"
              className="sr-only"
              tabIndex={-1}
              onChange={(evento) => void enviarArquivo(evento.target.files?.[0])}
            />
            <Button variant="secondary" loading={enviando} onClick={() => entrada.current?.click()}>
              <ImageUp className="size-4" aria-hidden />
              {logoVersion ? 'Trocar logo' : 'Enviar logo'}
            </Button>
            {logoVersion ? (
              <Button variant="ghost" onClick={() => setRemovendo(true)}>
                <Trash2 className="size-4" aria-hidden />
                Remover
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={removendo}
        onOpenChange={setRemovendo}
        title="Remover a logo?"
        description="O site volta a usar a marca padrão do Conquista Park."
        confirmLabel="Remover logo"
        onConfirm={remover}
      />
    </div>
  );
}
