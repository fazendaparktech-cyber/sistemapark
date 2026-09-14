'use client';

import {
  CalendarDays,
  ChevronDown,
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
    <nav aria-label="Menu do painel" className="grid gap-6">
      {nav.map((secao) => (
        <div key={secao.label || 'inicio'}>
          {secao.label ? (
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
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
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors',
                      atual
                        ? 'bg-pool-50 font-semibold text-pool-800'
                        : 'text-ink-600 hover:bg-ink-100/80 hover:text-ink-900',
                    )}
                  >
                    {atual ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-pool-600"
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
    <div className="mt-3 flex items-center gap-3 border-t border-ink-100 px-3 pt-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-grape-50 text-grape-600">
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
  timeZone,
  canSearch,
  user,
  children,
}: {
  nav: AdminNavSection[];
  parkName: string;
  /** Fuso do parque, para as datas dos avisos. */
  timeZone: string;
  /** Busca do topo: aparece para quem vê clientes, vendas ou ingressos. */
  canSearch: boolean;
  user: ShellUser;
  children: ReactNode;
}) {
  const [gavetaAberta, setGavetaAberta] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh py-4 pl-4 lg:block">
        <div className="flex h-full flex-col rounded-2xl bg-white px-3 py-5 shadow-[0_12px_40px_-16px_rgb(15_23_42/0.22)] ring-1 ring-ink-200/60">
          <Link href="/admin" className="w-fit px-3">
            <Logo className="h-8" />
          </Link>
          <div className="-mx-1 mt-7 flex-1 overflow-y-auto px-1">
            <Navegacao nav={nav} />
          </div>
          <CartaoDoParque nome={parkName} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <div className="sticky top-0 z-40 px-3 pt-3 sm:px-4 lg:pl-5 lg:pt-4">
          <header className="flex h-16 items-center gap-3 rounded-2xl bg-white/90 px-3 shadow-[0_12px_40px_-16px_rgb(15_23_42/0.22)] ring-1 ring-ink-200/60 backdrop-blur sm:px-4">
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

            {canSearch ? (
              <div className="ml-auto lg:ml-0">
                <GlobalSearch />
              </div>
            ) : null}
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <NotificationBell timeZone={timeZone} />
              <span aria-hidden className="mx-1 hidden h-8 w-px bg-ink-200 sm:block" />
              <MenuDaConta user={user} />
            </div>
          </header>
        </div>

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
