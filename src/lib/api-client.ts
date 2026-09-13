/**
 * Chamadas do navegador para a API do próprio sistema. Entende o formato
 * padrão de resposta (`{ data }` / `{ error }`) e transforma erro em `ApiError`
 * com código, mensagem pronta e erros por campo.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Mensagens por campo, quando o servidor recusou dados de um formulário. */
  get fields(): Record<string, string> {
    const campos = this.details.fields;
    if (!campos || typeof campos !== 'object') return {};
    return Object.fromEntries(
      Object.entries(campos as Record<string, unknown>).filter(
        (par): par is [string, string] => typeof par[1] === 'string',
      ),
    );
  }

  get retryAfterSeconds(): number | null {
    const valor = Number(this.details.retryAfterSeconds);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T>(
  caminho: string,
  opcoes: { method?: Metodo; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: opcoes.method ?? 'GET',
      headers: opcoes.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opcoes.body === undefined ? undefined : JSON.stringify(opcoes.body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opcoes.signal,
    });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro;
    throw new ApiError(
      'NETWORK_ERROR',
      'Sem conexão com o servidor. Verifique a internet e tente de novo.',
      0,
    );
  }

  let corpo: unknown = null;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }

  if (!resposta.ok) {
    const erro = (corpo as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)
      ?.error;
    throw new ApiError(
      typeof erro?.code === 'string' ? erro.code : 'UNEXPECTED_ERROR',
      typeof erro?.message === 'string'
        ? erro.message
        : 'Não foi possível concluir. Tente de novo em instantes.',
      resposta.status,
      erro?.details && typeof erro.details === 'object' ? (erro.details as Record<string, unknown>) : {},
    );
  }

  return (corpo as { data: T }).data;
}

/** Mensagem para mostrar ao usuário a partir de qualquer erro. */
export function errorMessage(erro: unknown): string {
  if (erro instanceof ApiError) {
    const espera = erro.retryAfterSeconds;
    if (erro.code === 'RATE_LIMITED' && espera) {
      const minutos = Math.ceil(espera / 60);
      return `Muitas tentativas seguidas. Tente de novo em ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
    }
    return erro.message;
  }
  return 'Algo deu errado. Tente de novo em instantes.';
}
