import { CalendarCheck, CalendarX, ChevronLeft, ChevronRight, Ticket, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CalendarMonth, PeriodDialog } from '@/components/admin/calendar/calendar-month';
import { MetricCard } from '@/components/admin/metric-card';
import { NoPermission } from '@/components/admin/no-permission';
import { buttonClasses } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { addDays, todayIn } from '@/lib/dates';
import { formatNumber, formatPercent } from '@/lib/format';
import { formatMonthYear } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getCalendarRange, specialPriceDates } from '@/server/calendar/service';
import type { SearchParamsRecord } from '@/server/filters';

export const metadata: Metadata = { title: 'Calendário' };

function mesDeslocado(mes: string, delta: number): string {
  const [ano = 2026, numero = 1] = mes.split('-').map(Number);
  const data = new Date(Date.UTC(ano, numero - 1 + delta, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const auth = await requirePageAuth();
  if (!can(auth, 'calendar.view')) return <NoPermission />;

  const hoje = todayIn(auth.park.timezone);
  const parametros = await searchParams;
  const pedido = typeof parametros.mes === 'string' ? parametros.mes : '';
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : hoje.slice(0, 7);
  const inicio = `${mes}-01`;
  const fim = addDays(`${mesDeslocado(mes, 1)}-01`, -1);

  const [dias, datasComPrecoEspecial] = await Promise.all([
    getCalendarRange(auth.park.id, inicio, fim),
    specialPriceDates(auth.park.id, inicio, fim),
  ]);
  const abertos = dias.filter((dia) => dia.status === 'OPEN');
  const lotacao = abertos.reduce((soma, dia) => soma + (dia.capacity ?? 0), 0);
  const vendidos = abertos.reduce((soma, dia) => soma + dia.sold, 0);
  const fechados = dias.filter((dia) => dia.status === 'CLOSED').length;
  const semConfiguracao = dias.filter((dia) => !dia.configured).length;

  // Valores iniciais dos formulários: os do último dia aberto configurado, ou um padrão.
  const referencia = [...abertos].reverse()[0];
  const padrao = {
    opensAt: referencia?.opensAt ?? '09:00',
    closesAt: referencia?.closesAt ?? '17:00',
    capacity: referencia?.capacity ?? 1000,
  };
  const podeGerenciar = can(auth, 'calendar.manage');

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Calendário"
        description="Dias de funcionamento, horários, capacidade, preços especiais e eventos. Dia sem configuração não vende, e nenhuma venda passa da capacidade."
        actions={
          podeGerenciar ? (
            <PeriodDialog
              defaults={padrao}
              initialFrom={inicio < hoje && fim >= hoje ? hoje : inicio}
              initialTo={fim}
            />
          ) : null
        }
      />

      <section
        aria-label="Resumo do mês"
        className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Dias abertos"
          value={formatNumber(abertos.length)}
          hint={`de ${dias.length} dias no mês`}
          icon={CalendarCheck}
        />
        <MetricCard
          label="Capacidade do mês"
          value={formatNumber(lotacao)}
          hint="Soma das vagas dos dias abertos"
          icon={Users}
          tone="grape"
        />
        <MetricCard
          label="Ingressos vendidos"
          value={formatNumber(vendidos)}
          hint={lotacao > 0 ? `${formatPercent(vendidos / lotacao)} da capacidade` : 'Nenhum dia aberto'}
          icon={Ticket}
          tone="sun"
        />
        <MetricCard
          label="Fechados ou em branco"
          value={formatNumber(fechados + semConfiguracao)}
          hint={`${formatNumber(fechados)} fechados, ${formatNumber(semConfiguracao)} sem configuração`}
          icon={CalendarX}
          tone="citrus"
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/calendario?mes=${mesDeslocado(mes, -1)}`}
            className={buttonClasses('secondary', 'icon')}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <h2 className="min-w-44 text-center font-display text-lg font-semibold text-ink-900">
            {formatMonthYear(mes).replace(/^./, (letra) => letra.toUpperCase())}
          </h2>
          <Link
            href={`/admin/calendario?mes=${mesDeslocado(mes, 1)}`}
            className={buttonClasses('secondary', 'icon')}
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          {mes !== hoje.slice(0, 7) ? (
            <Link href="/admin/calendario" className={buttonClasses('ghost', 'sm')}>
              Hoje
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-success-600" /> Aberto
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-danger-600" /> Esgotado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-ink-300" /> Fechado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="rounded bg-sun-100 px-1 text-[10px] font-semibold text-sun-800">
              R$
            </span>{' '}
            Preço especial
          </span>
          <span>
            {podeGerenciar ? 'Toque em um dia para editar' : 'Toque em um dia para ver os detalhes'}
          </span>
        </div>
      </div>

      <CalendarMonth
        days={dias}
        today={hoje}
        canManage={podeGerenciar}
        defaults={padrao}
        specialPriceDates={datasComPrecoEspecial}
      />
    </div>
  );
}
