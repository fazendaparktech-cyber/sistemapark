'use client';

import { CircleCheck, Clock, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api, errorMessage } from '@/lib/api-client';

import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { CopyButton } from '../ui/copy-button';
import { formatSeconds, useSecondsLeft } from './countdown';

/**
 * Pagamento do pedido: QR Code e PIX copia e cola, prazo e acompanhamento
 * automático. Quando o pagamento é confirmado, a página recarrega com os ingressos.
 */
export function PaymentPanel({
  code,
  token,
  expiresAt,
  pixPayload,
  qrSvg,
  totalLabel,
  canSimulate,
}: {
  code: string;
  token: string;
  expiresAt: string | null;
  pixPayload: string | null;
  qrSvg: string | null;
  totalLabel: string;
  canSimulate: boolean;
}) {
  const router = useRouter();
  const segundos = useSecondsLeft(expiresAt);
  const [gerando, setGerando] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const verificar = async () => {
      try {
        const situacao = await api<{ status: string }>(
          `/api/public/orders/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`,
        );
        if (situacao.status !== 'PENDING_PAYMENT') router.refresh();
      } catch {
        // Sem conexão por um instante: tenta de novo no próximo ciclo.
      }
    };
    const intervalo = setInterval(() => void verificar(), 4000);
    return () => clearInterval(intervalo);
  }, [code, token, router]);

  useEffect(() => {
    if (segundos === 0) router.refresh();
  }, [segundos, router]);

  async function gerarPix() {
    setGerando(true);
    setErro(null);
    try {
      await api(`/api/public/orders/${encodeURIComponent(code)}/pix`, { method: 'POST', body: { token } });
      router.refresh();
    } catch (falha) {
      setErro(errorMessage(falha));
    } finally {
      setGerando(false);
    }
  }

  async function simular() {
    setSimulando(true);
    setErro(null);
    try {
      await api(`/api/public/orders/${encodeURIComponent(code)}/simulate`, {
        method: 'POST',
        body: { token, outcome: 'APPROVED' },
      });
      router.refresh();
    } catch (falha) {
      setErro(errorMessage(falha));
      setSimulando(false);
    }
  }

  return (
    <div className="grid gap-5">
      {erro ? <Alert tone="danger">{erro}</Alert> : null}

      {pixPayload && qrSvg ? (
        <div className="grid gap-6 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center">
          <div
            className="mx-auto w-full max-w-60 rounded-2xl bg-white p-3 ring-1 ring-ink-200 [&_svg]:h-auto [&_svg]:w-full"
            role="img"
            aria-label={`QR Code do PIX de ${totalLabel}`}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="grid gap-4">
            <ol className="grid gap-2 text-[15px] leading-6 text-ink-700">
              <li>
                <span className="font-semibold text-ink-900">1.</span> Abra o aplicativo do seu banco e
                escolha pagar com PIX.
              </li>
              <li>
                <span className="font-semibold text-ink-900">2.</span> Leia o QR Code ou use o código copia e
                cola.
              </li>
              <li>
                <span className="font-semibold text-ink-900">3.</span> Confira o valor de{' '}
                <span className="tabular font-semibold text-ink-900">{totalLabel}</span> e confirme.
              </li>
            </ol>
            <div className="grid gap-2">
              <label htmlFor="pix-copia-e-cola" className="text-[13px] font-semibold text-ink-800">
                PIX copia e cola
              </label>
              <textarea
                id="pix-copia-e-cola"
                readOnly
                rows={3}
                value={pixPayload}
                onFocus={(evento) => evento.currentTarget.select()}
                className="w-full resize-none rounded-xl bg-ink-50 px-3 py-2 font-mono text-xs text-ink-700 ring-1 ring-inset ring-ink-200 focus:outline-none focus:ring-2 focus:ring-pool-600"
              />
              <CopyButton value={pixPayload} label="Copiar código PIX" size="lg" className="w-full" />
            </div>
          </div>
        </div>
      ) : (
        <Alert tone="warning" title="O código PIX ainda não foi gerado">
          <p>Houve uma falha ao falar com o banco. Tente gerar o código de novo.</p>
          <Button variant="secondary" className="mt-3" onClick={() => void gerarPix()} loading={gerando}>
            <RefreshCw className="size-4" aria-hidden />
            Gerar código PIX
          </Button>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sun-50 px-4 py-3 text-sm text-sun-800 ring-1 ring-inset ring-sun-200">
        <span className="flex items-center gap-2">
          <Clock className="size-4" aria-hidden />
          Pague em até{' '}
          <span className="tabular font-semibold">
            {segundos === null ? '--:--' : formatSeconds(segundos)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-sun-900">
          <span aria-hidden className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-sun-500 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-sun-600" />
          </span>
          Aguardando a confirmação do banco
        </span>
      </div>
      <p className="text-center text-[13px] text-ink-500">
        Não feche esta página: assim que o pagamento for confirmado, os ingressos aparecem aqui e chegam no
        seu e-mail.
      </p>

      {canSimulate ? (
        <div className="rounded-2xl border border-dashed border-grape-300 bg-grape-50/60 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-grape-700">
            Ambiente de teste
          </p>
          <p className="mt-1 text-[13px] text-grape-800">
            O PIX acima é fictício. Simule a confirmação do banco para ver o pedido pago.
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => void simular()} loading={simulando}>
            <CircleCheck className="size-4" aria-hidden />
            Simular pagamento aprovado
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      Imprimir ou salvar em PDF
    </Button>
  );
}
