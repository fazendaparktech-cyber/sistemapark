'use client';

import jsQR from 'jsqr';
import { CircleCheck, CircleX, ScanLine, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { api, errorMessage } from '@/lib/api-client';
import { formatDateBR, formatTimeBR, type DateOnly } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { CHECKIN_METHOD_LABELS, CHECKIN_REASON_LABELS } from '@/lib/tickets';
import type { CheckinDaySummary, CheckinResult, CheckinTicketInfo } from '@/server/checkin/service';
import type { TicketListItem } from '@/server/tickets/search';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { cn } from '../../ui/cn';
import { Spinner } from '../../ui/feedback';
import { Input } from '../../ui/field';
import { TicketStatusBadge } from '../status-badges';

/** Datas chegam da API como texto. */
type IngressoNaTela = Omit<CheckinTicketInfo, 'checkedInAt'> & { checkedInAt: string | null };
type ResultadoNaTela = Omit<CheckinResult, 'at' | 'ticket'> & { at: string; ticket: IngressoNaTela | null };
type ItemDaBusca = Omit<TicketListItem, 'checkedInAt'> & { checkedInAt: string | null };
export type GateSummary = Omit<CheckinDaySummary, 'recent'> & {
  recent: (Omit<CheckinDaySummary['recent'][number], 'at'> & { at: string })[];
};

interface LeitorNativo {
  detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/** Leitor de QR do próprio navegador (Chrome no Android); sem ele, a leitura é feita com jsQR. */
function leitorNativo(): LeitorNativo | null {
  const Construtor = (globalThis as { BarcodeDetector?: new (opcoes: { formats: string[] }) => LeitorNativo })
    .BarcodeDetector;
  if (!Construtor) return null;
  try {
    return new Construtor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

const INTERVALO_DE_LEITURA_MS = 180;
/** O mesmo QR parado na frente da câmera não é enviado de novo nesse intervalo. */
const IGNORAR_REPETIDO_MS = 4000;

function vibrar(liberado: boolean) {
  if ('vibrate' in navigator) navigator.vibrate(liberado ? 120 : [220, 90, 220]);
}

export function GateScanner({
  timezone,
  today,
  canScan,
  canManual,
  initialSummary,
}: {
  timezone: string;
  today: DateOnly;
  canScan: boolean;
  canManual: boolean;
  initialSummary: GateSummary | null;
}) {
  const [cameraAberta, setCameraAberta] = useState(false);
  const [erroDaCamera, setErroDaCamera] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoNaTela | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resumo, setResumo] = useState(initialSummary);
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState<{ termo: string; itens: ItemDaBusca[]; erro: string | null } | null>(
    null,
  );
  const [liberando, setLiberando] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fluxoRef = useRef<MediaStream | null>(null);
  const pausadoRef = useRef(false);
  const ultimaLeituraRef = useRef<{ texto: string; em: number } | null>(null);
  const acompanha = initialSummary !== null;

  const atualizarResumo = useCallback(() => {
    if (!acompanha) return;
    api<GateSummary>('/api/admin/checkin/summary')
      .then(setResumo)
      .catch(() => undefined);
  }, [acompanha]);

  useEffect(() => {
    if (!acompanha) return;
    const intervalo = setInterval(atualizarResumo, 30_000);
    return () => clearInterval(intervalo);
  }, [acompanha, atualizarResumo]);

  const mostrarResultado = useCallback(
    (novo: ResultadoNaTela) => {
      setResultado(novo);
      vibrar(novo.allowed);
      atualizarResumo();
    },
    [atualizarResumo],
  );

  const enviarLeitura = useCallback(
    async (texto: string) => {
      pausadoRef.current = true;
      setEnviando(true);
      try {
        mostrarResultado(
          await api<ResultadoNaTela>('/api/admin/checkin/scan', {
            method: 'POST',
            body: { payload: texto, device: 'Câmera da portaria' },
          }),
        );
      } catch (falha) {
        toast.error(errorMessage(falha));
        pausadoRef.current = false;
      } finally {
        setEnviando(false);
      }
    },
    [mostrarResultado],
  );

  function pararCamera() {
    for (const faixa of fluxoRef.current?.getTracks() ?? []) faixa.stop();
    fluxoRef.current = null;
  }

  function fecharCamera() {
    pararCamera();
    setCameraAberta(false);
  }

  async function abrirCamera() {
    setErroDaCamera(null);
    if (!('mediaDevices' in navigator) || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setErroDaCamera('Este navegador não libera a câmera. Use a busca pelo nome, CPF ou código.');
      return;
    }
    try {
      fluxoRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      pausadoRef.current = false;
      setCameraAberta(true);
    } catch (falha) {
      const nome = falha instanceof DOMException ? falha.name : '';
      setErroDaCamera(
        nome === 'NotAllowedError'
          ? 'O acesso à câmera foi bloqueado. Libere a câmera para este site nas permissões do navegador e tente de novo.'
          : nome === 'NotFoundError'
            ? 'Nenhuma câmera encontrada neste aparelho.'
            : 'Não foi possível abrir a câmera. Feche outros aplicativos que estejam usando a câmera e tente de novo.',
      );
    }
  }

  useEffect(() => {
    if (!cameraAberta) return;
    const video = videoRef.current;
    const fluxo = fluxoRef.current;
    if (!video || !fluxo) return;
    video.srcObject = fluxo;
    void video.play().catch(() => undefined);

    const nativo = leitorNativo();
    const tela = document.createElement('canvas');
    const contexto = tela.getContext('2d', { willReadFrequently: true });
    let ativo = true;
    let proxima: ReturnType<typeof setTimeout> | undefined;

    const ler = async () => {
      if (!ativo) return;
      if (!pausadoRef.current && video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        let texto: string | null = null;
        try {
          if (nativo) {
            texto = (await nativo.detect(video))[0]?.rawValue ?? null;
          } else if (contexto) {
            // Quadro reduzido: leitura rápida mesmo em celular simples.
            const escala = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
            tela.width = Math.round(video.videoWidth * escala);
            tela.height = Math.round(video.videoHeight * escala);
            contexto.drawImage(video, 0, 0, tela.width, tela.height);
            const imagem = contexto.getImageData(0, 0, tela.width, tela.height);
            texto =
              jsQR(imagem.data, imagem.width, imagem.height, { inversionAttempts: 'dontInvert' })?.data ??
              null;
          }
        } catch {
          texto = null;
        }
        const ultima = ultimaLeituraRef.current;
        const repetida =
          ultima !== null && ultima.texto === texto && Date.now() - ultima.em < IGNORAR_REPETIDO_MS;
        if (texto && !repetida && ativo) {
          ultimaLeituraRef.current = { texto, em: Date.now() };
          void enviarLeitura(texto);
        }
      }
      proxima = setTimeout(() => void ler(), INTERVALO_DE_LEITURA_MS);
    };
    void ler();

    return () => {
      ativo = false;
      clearTimeout(proxima);
    };
  }, [cameraAberta, enviarLeitura]);

  useEffect(() => pararCamera, []);

  const pesquisa = termo.trim();
  useEffect(() => {
    if (!canManual || pesquisa.length < 3) return;
    const controle = new AbortController();
    const espera = setTimeout(() => {
      api<ItemDaBusca[]>(`/api/admin/checkin/search?q=${encodeURIComponent(pesquisa)}`, {
        signal: controle.signal,
      })
        .then((itens) => setBusca({ termo: pesquisa, itens, erro: null }))
        .catch((falha: unknown) => {
          if (falha instanceof DOMException && falha.name === 'AbortError') return;
          setBusca({ termo: pesquisa, itens: [], erro: errorMessage(falha) });
        });
    }, 350);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [canManual, pesquisa]);

  const buscaAtual = busca?.termo === pesquisa ? busca : null;

  async function liberar(ticketId: string) {
    setLiberando(ticketId);
    try {
      const novo = await api<ResultadoNaTela>('/api/admin/checkin/manual', {
        method: 'POST',
        body: { ticketId, device: 'Busca da portaria' },
      });
      mostrarResultado(novo);
      if (novo.allowed) {
        setBusca((atual) =>
          atual
            ? {
                ...atual,
                itens: atual.itens.map((item) =>
                  item.id === ticketId
                    ? { ...item, status: 'CHECKED_IN', checkedInAt: novo.ticket?.checkedInAt ?? novo.at }
                    : item,
                ),
              }
            : atual,
        );
      }
    } catch (falha) {
      toast.error(errorMessage(falha));
    } finally {
      setLiberando(null);
    }
  }

  function proximaLeitura() {
    setResultado(null);
    const ultima = ultimaLeituraRef.current;
    if (ultima) ultimaLeituraRef.current = { ...ultima, em: Date.now() };
    pausadoRef.current = false;
  }

  const pessoaDoResultado = resultado?.ticket
    ? (resultado.ticket.holderName ?? resultado.ticket.buyerName)
    : null;

  return (
    <div className="grid gap-6">
      {canScan ? (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => void abrirCamera()}
            className="flex h-24 w-full items-center justify-center gap-3 rounded-2xl bg-pool-700 font-display text-xl font-semibold uppercase tracking-wide text-white shadow-card transition-colors hover:bg-pool-800 active:translate-y-px sm:h-28 sm:text-2xl"
          >
            <ScanLine className="size-8" aria-hidden />
            Escanear QR Code
          </button>
          {erroDaCamera ? <Alert tone="warning">{erroDaCamera}</Alert> : null}
        </div>
      ) : null}

      {canManual ? (
        <Card>
          <CardHeader
            title="Buscar ingresso"
            description="Nome do visitante ou do comprador, CPF, celular, código do ingresso ou número do pedido."
          />
          <CardContent className="grid gap-3 pt-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-400"
                aria-hidden
              />
              <Input
                type="search"
                value={termo}
                onChange={(evento) => setTermo(evento.target.value)}
                placeholder="Digite pelo menos 3 caracteres"
                aria-label="Buscar ingresso"
                autoComplete="off"
                className="h-12 pl-12 text-base"
              />
            </div>
            {pesquisa.length >= 3 ? (
              !buscaAtual ? (
                <p className="flex items-center gap-2 py-2 text-sm text-ink-500">
                  <Spinner className="size-4" />
                  Buscando ingressos
                </p>
              ) : buscaAtual.erro ? (
                <Alert tone="danger">{buscaAtual.erro}</Alert>
              ) : buscaAtual.itens.length === 0 ? (
                <p className="py-2 text-sm text-ink-500">
                  Nenhum ingresso encontrado. Confira o que foi digitado.
                </p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {buscaAtual.itens.map((item) => {
                    const deHoje = item.visitDate === today;
                    return (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900">{item.holderName ?? item.buyerName}</p>
                          <p className="text-[13px] text-ink-500">
                            {item.typeName} · <span className="font-mono">{item.code}</span> ·{' '}
                            {deHoje ? 'hoje' : formatDateBR(item.visitDate)}
                          </p>
                          <p className="text-xs text-ink-500">
                            Pedido {item.orderCode}
                            {item.holderName && item.holderName !== item.buyerName
                              ? ` · compra de ${item.buyerName}`
                              : ''}
                            {item.checkedInAt
                              ? ` · entrou às ${formatTimeBR(new Date(item.checkedInAt), timezone)}`
                              : ''}
                          </p>
                        </div>
                        {item.status === 'ACTIVE' && deHoje ? (
                          <Button
                            size="lg"
                            onClick={() => void liberar(item.id)}
                            loading={liberando === item.id}
                            disabled={liberando !== null}
                          >
                            Liberar entrada
                          </Button>
                        ) : (
                          <TicketStatusBadge status={item.status} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {resumo ? (
        <Card>
          <CardHeader
            title="Hoje na portaria"
            description={`${formatDateBR(resumo.date)}${
              resumo.capacity !== null ? ` · capacidade de ${formatNumber(resumo.capacity)} pessoas` : ''
            }`}
          />
          <CardContent className="grid gap-4 pt-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { rotulo: 'Esperados', valor: resumo.expected, classe: 'text-ink-900' },
                { rotulo: 'Entraram', valor: resumo.checkedIn, classe: 'text-success-700' },
                { rotulo: 'Faltam chegar', valor: resumo.remaining, classe: 'text-ink-900' },
                { rotulo: 'Negadas hoje', valor: resumo.deniedToday, classe: 'text-danger-700' },
              ].map((item) => (
                <div
                  key={item.rotulo}
                  className="rounded-xl bg-ink-50 px-3 py-2.5 ring-1 ring-inset ring-ink-200/70"
                >
                  <dt className="text-xs font-medium text-ink-500">{item.rotulo}</dt>
                  <dd className={cn('tabular font-display text-2xl font-semibold', item.classe)}>
                    {formatNumber(item.valor)}
                  </dd>
                </div>
              ))}
            </dl>
            {resumo.recent.length === 0 ? (
              <p className="text-sm text-ink-500">Nenhuma leitura registrada hoje.</p>
            ) : (
              <div>
                <p className="mb-1 text-[13px] font-semibold text-ink-700">Últimas leituras</p>
                <ul className="divide-y divide-ink-100">
                  {resumo.recent.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 py-2.5">
                      {item.allowed ? (
                        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-700" aria-hidden />
                      ) : (
                        <CircleX className="mt-0.5 size-5 shrink-0 text-danger-700" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {item.personName ?? (item.code ? `Código ${item.code}` : 'Leitura sem ingresso')}
                          {item.typeName ? (
                            <span className="font-normal text-ink-500"> · {item.typeName}</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-ink-500">
                          {item.allowed
                            ? 'Entrada liberada'
                            : item.reason
                              ? CHECKIN_REASON_LABELS[item.reason]
                              : 'Negada'}{' '}
                          · {formatTimeBR(new Date(item.at), timezone)} · {CHECKIN_METHOD_LABELS[item.method]}
                          {item.operatorName ? ` · ${item.operatorName}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {cameraAberta ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-ink-950"
          role="dialog"
          aria-modal="true"
          aria-label="Leitura do QR Code"
        >
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
            <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="size-[min(72vw,340px)] rounded-3xl border-4 border-white/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]" />
            </div>
            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <p className="rounded-full bg-black/55 px-3.5 py-2 text-sm font-medium text-white">
                {enviando ? 'Conferindo o ingresso' : 'Aponte para o QR Code do ingresso'}
              </p>
              <button
                type="button"
                onClick={fecharCamera}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-black/55 text-white"
                aria-label="Fechar câmera"
              >
                <X className="size-6" aria-hidden />
              </button>
            </div>
            {enviando ? (
              <div className="absolute inset-x-0 bottom-10 flex justify-center">
                <Spinner className="size-9 text-white" label="Conferindo o ingresso" />
              </div>
            ) : null}
          </div>
          {canManual ? (
            <div className="bg-ink-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button variant="secondary" size="lg" className="w-full" onClick={fecharCamera}>
                <Search className="size-4" aria-hidden />
                Buscar pelo nome ou CPF
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {resultado ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="resultado-da-portaria"
          className={cn(
            'fixed inset-0 z-[70] flex flex-col overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-white',
            resultado.allowed ? 'bg-success-700' : 'bg-danger-700',
          )}
        >
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 text-center">
            {resultado.allowed ? (
              <CircleCheck className="size-24" strokeWidth={1.75} aria-hidden />
            ) : (
              <CircleX className="size-24" strokeWidth={1.75} aria-hidden />
            )}
            <h2
              id="resultado-da-portaria"
              className="font-display text-4xl font-bold uppercase leading-tight tracking-tight sm:text-5xl"
            >
              {resultado.allowed ? 'Entrada liberada' : 'Entrada negada'}
            </h2>
            {!resultado.allowed ? <p className="text-xl font-semibold">{resultado.title}</p> : null}
            {resultado.detail ? (
              <p className="text-base leading-7 text-white/90">{resultado.detail}</p>
            ) : null}
            {resultado.ticket ? (
              <dl className="mt-2 grid w-full gap-2.5 rounded-2xl bg-white/15 p-4 text-left text-base ring-1 ring-inset ring-white/25">
                <div className="flex justify-between gap-4">
                  <dt className="text-white/75">Nome</dt>
                  <dd className="text-right font-semibold">{pessoaDoResultado}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/75">Tipo</dt>
                  <dd className="text-right font-semibold">{resultado.ticket.typeName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/75">Data</dt>
                  <dd className="text-right font-semibold">{formatDateBR(resultado.ticket.visitDate)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/75">Horário</dt>
                  <dd className="tabular text-right font-semibold">
                    {formatTimeBR(new Date(resultado.at), timezone)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/75">Código</dt>
                  <dd className="text-right font-mono font-semibold">{resultado.ticket.code}</dd>
                </div>
              </dl>
            ) : null}
          </div>
          <div className="mx-auto mt-6 w-full max-w-md">
            <button
              type="button"
              onClick={proximaLeitura}
              className="h-16 w-full rounded-2xl bg-white text-lg font-bold text-ink-950 shadow-pop active:translate-y-px"
            >
              {cameraAberta ? 'Ler próximo ingresso' : 'Continuar'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
