import { CalendarRange } from 'lucide-react';
import Link from 'next/link';

import type { ParsedPeriod, PeriodPreset } from '@/lib/periods';

import { buttonClasses } from '../ui/button';
import { cn } from '../ui/cn';
import { Input, Label } from '../ui/field';

const ATALHOS: { key: PeriodPreset; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'mes-anterior', label: 'Mês anterior' },
  { key: 'ano', label: 'Este ano' },
];

const PILULA = 'whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors';

/** Filtro de período por links: funciona sem JavaScript e fica na URL (dá para compartilhar). */
export function PeriodFilter({ basePath, period }: { basePath: string; period: ParsedPeriod }) {
  const personalizado = period.key === 'personalizado';
  return (
    <div className="flex min-w-0 items-center gap-2">
      <nav aria-label="Período" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 py-1">
        {ATALHOS.map((atalho) => {
          const atual = period.key === atalho.key;
          return (
            <Link
              key={atalho.key}
              href={`${basePath}?periodo=${atalho.key}`}
              aria-current={atual ? 'page' : undefined}
              className={cn(
                PILULA,
                atual
                  ? 'bg-ink-900 text-white'
                  : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50',
              )}
            >
              {atalho.label}
            </Link>
          );
        })}
      </nav>
      <details className="group relative shrink-0">
        <summary
          className={cn(
            PILULA,
            'flex cursor-pointer list-none items-center gap-1.5',
            personalizado
              ? 'bg-ink-900 text-white'
              : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50',
          )}
        >
          <CalendarRange className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Personalizado</span>
          <span className="sr-only sm:hidden">Período personalizado</span>
        </summary>
        <form
          method="get"
          action={basePath}
          className="absolute right-0 z-30 mt-2 grid w-[min(18rem,calc(100vw-2rem))] gap-3 rounded-xl bg-white p-4 shadow-pop ring-1 ring-ink-200"
        >
          <input type="hidden" name="periodo" value="personalizado" />
          <div className="grid gap-1.5">
            <Label htmlFor="periodo-de">De</Label>
            <Input id="periodo-de" type="date" name="de" required defaultValue={period.range.from} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="periodo-ate">Até</Label>
            <Input id="periodo-ate" type="date" name="ate" required defaultValue={period.range.to} />
          </div>
          <p className="text-xs text-ink-500">Até 366 dias.</p>
          <button type="submit" className={buttonClasses('primary', 'md', 'w-full')}>
            Aplicar
          </button>
        </form>
      </details>
    </div>
  );
}
