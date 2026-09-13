'use client';

import { RotateCw } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/** Erro inesperado numa página. Em produção a mensagem original não chega ao navegador; só o código. */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-[60dvh] place-items-center px-5 py-16">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm font-medium text-danger-700">Erro</p>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-900">
          Algo deu errado
        </h1>
        <p className="mt-2 text-[15px] leading-7 text-ink-500">
          Não foi possível carregar esta parte do sistema. Tente de novo; se continuar, informe o código
          abaixo à administração.
        </p>
        {error.digest ? <p className="mt-4 font-mono text-xs text-ink-500">Código: {error.digest}</p> : null}
        <Button className="mt-6" onClick={() => retry()}>
          <RotateCw className="size-4" aria-hidden /> Tentar de novo
        </Button>
      </div>
    </main>
  );
}
