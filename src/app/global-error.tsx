'use client';

/**
 * Último recurso: erro no layout raiz. Substitui o documento inteiro, então não
 * conta com o CSS do sistema — os estilos ficam aqui mesmo.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f4f6f9',
          color: '#1e1a2e',
        }}
      >
        <title>Erro · Conquista Park</title>
        <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>O sistema teve um problema</h1>
            <p style={{ color: '#5a5570', lineHeight: 1.6, margin: 0 }}>
              Tente de novo em instantes. Se continuar, informe o código abaixo à administração.
            </p>
            {error.digest ? (
              <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#716c87' }}>
                Código: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => retry()}
              style={{
                marginTop: 16,
                height: 44,
                padding: '0 20px',
                borderRadius: 12,
                border: 0,
                background: '#146f83',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Tentar de novo
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
