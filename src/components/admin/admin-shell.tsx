'use client';

import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  MapPin,
  Megaphone,
  Menu,
  ReceiptText,
  ScanLine,
  Settings,
  ShieldCheck,
  Tags,
  Ticket,
  TicketPercent,
  Users,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dialog as Gaveta, DropdownMenu } from 'radix-ui';
import { useState, type ReactNode } from 'react';

import { useLogout } from '../auth/logout-button';
import { Logo } from '../brand/logo';
import { cn } from '../ui/cn';
import { GlobalSearch } from './global-search';
import type { AdminIcon, AdminNavSection } from './nav';
import { NotificationBell } from './notification-bell';

const ICONES: Record<AdminIcon, LucideIcon> = {
  overview: LayoutDashboard,
  orders: ReceiptText,
  customers: UsersRound,
  coupons: TicketPercent,
  tickets: Ticket,
  ticketTypes: Tags,
  calendar: CalendarDays,
  gate: ScanLine,
  finance: Wallet,
  reports: FileSpreadsheet,
  marketing: Megaphone,
  team: Users,
  permissions: ShieldCheck,
  audit: ClipboardList,
  settings: Settings,
};

interface ShellUser {
  name: string;
  email: string;
  roleNames: string[];
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '';
  return `${primeira}${ultima}`.toUpperCase();
}

function Navegacao({ nav, onNavigate }: { nav: AdminNavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const ativo = (href: string) =>
    href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Menu do painel" className="grid gap-7">
      {nav.map((secao) => (
        <div key={secao.label || 'inicio'}>
          {secao.label ? (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              {secao.label}
            </p>
          ) : null}
          <ul className="grid gap-0.5">
            {secao.items.map((item) => {
              const Icone = ICONES[item.icon];
              const atual = ativo(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={atual ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium transition-colors',
                      atual
                        ? 'bg-pool-50 text-pool-800'
                        : 'text-ink-600 hover:bg-ink-100/80 hover:text-ink-900',
                    )}
                  >
                    {atual ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-2 -left-4 w-1 rounded-r-full bg-pool-600"
                      />
                    ) : null}
                    <Icone
                      aria-hidden
                      className={cn(
                        'size-[18px] shrink-0',
                        atual ? 'text-pool-700' : 'text-ink-400 group-hover:text-ink-600',
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function CartaoDoParque({ nome }: { nome: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-ink-50 px-3 py-2.5 ring-1 ring-ink-200/70">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-grape-600 ring-1 ring-ink-200">
        <MapPin className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-ink-900">{nome}</p>
        <p className="text-xs text-ink-500">Unidade atual</p>
      </div>
    </div>
  );
}

const ITEM_DO_MENU =
  'flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none data-[highlighted]:bg-ink-100 data-[highlighted]:text-ink-900 data-[disabled]:opacity-50';

function MenuDaConta({ user }: { user: ShellUser }) {
  const { sair, saindo } = useLogout();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 transition-colors hover:bg-ink-100 data-[state=open]:bg-ink-100"
        aria-label="Menu da sua conta"
      >
        <span className="grid size-9 place-items-center rounded-full bg-grape-600 text-[13px] font-semibold text-white">
          {iniciais(user.name)}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-44 truncate text-sm font-semibold text-ink-900">{user.name}</span>
          <span className="block max-w-44 truncate text-xs text-ink-500">{user.roleNames.join(', ')}</span>
        </span>
        <ChevronDown className="hidden size-4 text-ink-400 sm:block" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-64 rounded-xl bg-white p-1.5 shadow-pop ring-1 ring-ink-200 data-[state=open]:animate-rise-in"
        >
          <div className="px-3 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-ink-100" />
          <DropdownMenu.Item asChild className={ITEM_DO_MENU}>
            <Link href="/trocar-senha">
              <KeyRound className="size-4 text-ink-500" aria-hidden />
              Trocar senha
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={ITEM_DO_MENU}
            disabled={saindo}
            onSelect={(evento) => {
              evento.preventDefault();
              void sair();
            }}
          >
            <LogOut className="size-4 text-ink-500" aria-hidden />
            {saindo ? 'Saindo…' : 'Sair'}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AdminShell({
  nav,
  parkName,
  salesUrl,
  timeZone,
  canSearch,
  user,
  children,
}: {
  nav: AdminNavSection[];
  parkName: string;
  /** Página pública de compra, aberta em outra aba. */
  salesUrl: string;
  /** Fuso do parque, para as datas dos avisos. */
  timeZone: string;
  /** Busca do topo: aparece para quem vê clientes, vendas ou ingressos. */
  canSearch: boolean;
  user: ShellUser;
  children: ReactNode;
}) {
  const [gavetaAberta, setGavetaAberta] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-ink-200/70 bg-white/80 px-4 py-6 backdrop-blur lg:flex">
        <Link href="/admin" className="w-fit px-3">
          <Logo className="h-9" />
        </Link>
        <div className="mt-9 flex-1 overflow-y-auto pl-1">
          <Navegacao nav={nav} />
        </div>
        <CartaoDoParque nome={parkName} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-ink-200/70 bg-canvas/85 px-4 backdrop-blur sm:px-6 lg:px-10">
          <div className="flex items-center gap-1.5 lg:hidden">
            <Gaveta.Root open={gavetaAberta} onOpenChange={setGavetaAberta}>
              <Gaveta.Trigger
                className="grid size-10 place-items-center rounded-xl text-ink-700 transition-colors hover:bg-ink-100"
                aria-label="Abrir menu"
              >
                <Menu className="size-5" aria-hidden />
              </Gaveta.Trigger>
              <Gaveta.Portal>
                <Gaveta.Overlay className="fixed inset-0 z-50 bg-ink-950/40 data-[state=open]:animate-fade-in" />
                <Gaveta.Content
                  aria-describedby={undefined}
                  className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,300px)] flex-col bg-white px-4 py-5 shadow-pop data-[state=open]:animate-slide-in-left focus:outline-none"
                >
                  <Gaveta.Title className="sr-only">Menu do painel</Gaveta.Title>
                  <div className="flex items-center justify-between px-3">
                    <Logo className="h-8" />
                    <Gaveta.Close
                      className="grid size-10 place-items-center rounded-xl text-ink-500 hover:bg-ink-100"
                      aria-label="Fechar menu"
                    >
                      <X className="size-5" aria-hidden />
                    </Gaveta.Close>
                  </div>
                  <div className="mt-8 flex-1 overflow-y-auto pl-1">
                    <Navegacao nav={nav} onNavigate={() => setGavetaAberta(false)} />
                  </div>
                  <CartaoDoParque nome={parkName} />
                </Gaveta.Content>
              </Gaveta.Portal>
            </Gaveta.Root>
            <Link href="/admin" aria-label="Visão geral">
              <Logo className="h-8" />
            </Link>
          </div>

          <p className="hidden truncate text-sm text-ink-500 lg:block">
            Painel · <span className="font-semibold text-ink-800">{parkName}</span>
          </p>

          <div className="flex items-center gap-1 sm:gap-2">
            {canSearch ? <GlobalSearch /> : null}
            <NotificationBell timeZone={timeZone} />
            <a
              href={salesUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-pool-800 transition-colors hover:bg-pool-50"
            >
              <ExternalLink className="size-4" aria-hidden />
              <span className="hidden sm:inline">Página de vendas</span>
              <span className="sr-only sm:hidden">Abrir a página de vendas</span>
            </a>
            <MenuDaConta user={user} />
          </div>
        </header>

        <main
          id="conteudo"
          className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
