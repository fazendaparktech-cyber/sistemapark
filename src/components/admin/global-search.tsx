'use client';

import { ReceiptText, Search, Ticket, UsersRound, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { api } from '@/lib/api-client';

import { cn } from '../ui/cn';

interface Resultado {
  id: string;
  title: string;
  detail: string;
  href: string;
}

interface Resposta {
  query: string;
  customers: Resultado[] | null;
  orders: Resultado[] | null;
  tickets: Resultado[] | null;
}

const MINIMO = 2;

const GRUPOS = [
  { chave: 'customers', rotulo: 'Clientes', icone: UsersRound, lista: '/admin/clientes' },
  { chave: 'orders', rotulo: 'Vendas', icone: ReceiptText, lista: '/admin/vendas' },
  { chave: 'tickets', rotulo: 'Ingressos', icone: Ticket, lista: '/admin/ingressos' },
] as const;

/**
 * Busca do topo do painel. Abre com clique, com "/" ou com Ctrl+K (Cmd+K no
 * Mac); setas escolhem o resultado e Enter abre.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const q = termo.trim();

  useEffect(() => {
    function atalho(evento: KeyboardEvent) {
      const alvo = evento.target instanceof HTMLElement ? evento.target : null;
      const digitando =
        alvo !== null && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
      const comando = evento.key.toLowerCase() === 'k' && (evento.metaKey || evento.ctrlKey);
      if (comando || (evento.key === '/' && !digitando)) {
        evento.preventDefault();
        setAberto(true);
      }
    }
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, []);

  useEffect(() => {
    if (q.length < MINIMO) return;
    const controle = new AbortController();
    const espera = setTimeout(() => {
      setBuscando(true);
      api<Resposta>(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: controle.signal })
        .then((dados) => {
          setResposta(dados);
          setAtivo(0);
          setBuscando(false);
        })
        .catch((erro: unknown) => {
          if (erro instanceof DOMException && erro.name === 'AbortError') return;
          setBuscando(false);
        });
    }, 250);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [q]);

  const exibida = q.length >= MINIMO ? resposta : null;
  const itens = useMemo(
    () =>
      exibida
        ? GRUPOS.flatMap((grupo) =>
            (exibida[grupo.chave] ?? []).map((item) => ({ ...item, grupo: grupo.chave })),
          )
        : [],
    [exibida],
  );

  function mudarAbertura(valor: boolean) {
    setAberto(valor);
    if (!valor) {
      setTermo('');
      setResposta(null);
      setAtivo(0);
    }
  }

  function aoTeclar(evento: ReactKeyboardEvent<HTMLInputElement>) {
    if (itens.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAtivo((atual) => (atual + 1) % itens.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setAtivo((atual) => (atual - 1 + itens.length) % itens.length);
    } else if (evento.key === 'Enter') {
      const escolhido = itens[ativo];
      if (!escolhido) return;
      evento.preventDefault();
      mudarAbertura(false);
      router.push(escolhido.href);
    }
  }

  const nenhumGrupo = exibida !== null && GRUPOS.every((grupo) => exibida[grupo.chave] === null);

  return (
    <Dialog.Root open={aberto} onOpenChange={mudarAbertura}>
      <Dialog.Trigger
        className="flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 md:w-64 md:bg-white md:px-3 md:ring-1 md:ring-inset md:ring-ink-200 lg:w-80"
        aria-label="Buscar cliente, CPF, telefone, pedido ou ingresso"
      >
        <Search className="size-5 shrink-0 md:size-4" aria-hidden />
        <span className="hidden truncate text-sm md:inline">Buscar cliente, CPF, pedido…</span>
        <kbd className="ml-auto hidden rounded-md bg-ink-100 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-500 lg:inline">
          /
        </kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/40 data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-3 top-3 z-50 mx-auto flex max-h-[min(85dvh,40rem)] max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-ink-200 focus:outline-none data-[state=open]:animate-rise-in sm:top-[12vh]"
        >
          <Dialog.Title className="sr-only">Buscar no painel</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-ink-100 pl-4 pr-2">
            <Search className="size-5 shrink-0 text-ink-400" aria-hidden />
            <input
              value={termo}
              onChange={(evento) => setTermo(evento.target.value)}
              onKeyDown={aoTeclar}
              placeholder="Nome, CPF, telefone, pedido ou código do ingresso"
              aria-label="Buscar cliente, CPF, telefone, pedido ou ingresso"
              autoComplete="off"
              spellCheck={false}
              className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400"
            />
            <Dialog.Close
              className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
              aria-label="Fechar busca"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-2" aria-live="polite">
            {q.length < MINIMO ? (
              <p className="px-3 py-8 text-center text-sm text-ink-500">
                Digite pelo menos {MINIMO} letras ou números.
              </p>
            ) : !exibida ? (
              <p className="px-3 py-8 text-center text-sm text-ink-500">{buscando ? 'Buscando…' : ' '}</p>
            ) : nenhumGrupo ? (
              <p className="px-3 py-8 text-center text-sm text-ink-500">
                Seu perfil não tem acesso a clientes, vendas nem ingressos.
              </p>
            ) : itens.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-500">Nada encontrado para “{q}”.</p>
            ) : (
              GRUPOS.map((grupo) => {
                const lista = exibida[grupo.chave];
                if (!lista || lista.length === 0) return null;
                const Icone = grupo.icone;
                return (
                  <section key={grupo.chave} aria-label={grupo.rotulo} className="py-1">
                    <div className="flex items-center justify-between px-3 pb-1 pt-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                        {grupo.rotulo}
                      </h3>
                      <Link
                        href={`${grupo.lista}?q=${encodeURIComponent(q)}`}
                        onClick={() => mudarAbertura(false)}
                        className="text-xs font-semibold text-pool-700 hover:text-pool-800"
                      >
                        Ver todos
                      </Link>
                    </div>
                    <ul>
                      {lista.map((item) => {
                        const indice = itens.findIndex(
                          (outro) => outro.grupo === grupo.chave && outro.id === item.id,
                        );
                        return (
                          <li key={item.id}>
                            <Link
                              href={item.href}
                              onClick={() => mudarAbertura(false)}
                              onMouseEnter={() => setAtivo(indice)}
                              aria-current={indice === ativo ? 'true' : undefined}
                              className={cn(
                                'flex items-center gap-3 rounded-xl px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-pool-500',
                                indice === ativo ? 'bg-pool-50' : 'hover:bg-ink-50',
                              )}
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-ink-500 ring-1 ring-ink-200">
                                <Icone className="size-4" aria-hidden />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-ink-900">
                                  {item.title}
                                </span>
                                <span className="block truncate text-[13px] text-ink-500">{item.detail}</span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
