import { CalendarCheck, ChevronLeft, ChevronRight, Ticket, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CalendarMonth, PeriodDialog } from '@/components/admin/calendar/calendar-month';
import { MetricCard } from '@/components/admin/metric-card';
import { NoPermission } from '@/components/admin/no-permission';
import { Alert } from '@/components/ui/alert';
import { buttonClasses } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { addDays, todayIn } from '@/lib/dates';
import { formatNumber, formatPercent, plural } from '@/lib/format';
import { formatMonthYear } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getCalendarRange, specialPriceDates } from '@/server/calendar/service';
import type { SearchParamsRecord } from '@/server/filters';
import { getOperationsSettings } from '@/server/settings/service';

export const metadata: Metadata = { title: 'Calendário' };

function mesDeslocado(mes: string, delta: number): string {
  const [ano = 2026, numero = 1] = mes.split('-').map(Number);
  const data = new Date(Date.UTC(ano, numero - 1 + delta, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

const LEGENDA = [
  { rotulo: 'Aberto', classe: 'bg-success-600' },
  { rotulo: 'Esgotado', classe: 'bg-danger-600' },
  { rotulo: 'Fechado', classe: 'bg-ink-300' },
  { rotulo: 'Sem configuração', classe: 'ring-1 ring-ink-300' },
];

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

  const [dias, datasComPrecoEspecial, funcionamento] = await Promise.all([
    getCalendarRange(auth.park.id, inicio, fim),
    specialPriceDates(auth.park.id, inicio, fim),
    getOperationsSettings(auth.park.id),
  ]);
  const abertos = dias.filter((dia) => dia.status === 'OPEN');
  const lotacao = abertos.reduce((soma, dia) => soma + (dia.capacity ?? 0), 0);
  const vendidos = abertos.reduce((soma, dia) => soma + dia.sold, 0);
  const fechados = dias.filter((dia) => dia.status === 'CLOSED').length;
  const vagasLivres = abertos
    .filter((dia) => dia.date >= hoje)
    .reduce((soma, dia) => soma + (dia.available ?? 0), 0);
  const semConfiguracao = dias.filter((dia) => !dia.configured && dia.date >= hoje).length;

  // Valores iniciais dos formulários: o funcionamento padrão definido em Configurações.
  const padrao = {
    opensAt: funcionamento.opensAt,
    closesAt: funcionamento.closesAt,
    capacity: funcionamento.capacity,
    weekdays: funcionamento.openWeekdays,
  };
  const podeGerenciar = can(auth, 'calendar.manage');

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Calendário"
        description={
          podeGerenciar
            ? 'Dias abertos, horários, capacidade e preços de cada data. Clique em um dia para editar.'
            : 'Dias abertos, horários, capacidade e preços de cada data.'
        }
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

      <section aria-label="Resumo do mês" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Dias abertos"
          value={formatNumber(abertos.length)}
          hint={`de ${dias.length} dias · ${plural(fechados, 'fechado', 'fechados')}`}
          icon={CalendarCheck}
        />
        <MetricCard
          label="Ingressos vendidos"
          value={formatNumber(vendidos)}
          hint={
            lotacao > 0 ? `${formatPercent(vendidos / lotacao)} da capacidade do mês` : 'nenhum dia aberto'
          }
          icon={Ticket}
        />
        <MetricCard
          label="Vagas livres"
          value={formatNumber(vagasLivres)}
          hint={fim < hoje ? 'mês encerrado' : 'nos dias abertos a partir de hoje'}
          icon={Users}
        />
      </section>

      {semConfiguracao > 0 ? (
        <Alert tone="warning" title={`${plural(semConfiguracao, 'dia', 'dias')} sem configuração`}>
          Esses dias não aparecem para venda.{' '}
          {podeGerenciar ? 'Use "Configurar período" para abrir ou fechar de uma vez.' : null}
        </Alert>
      ) : null}

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
        {/* No celular os dias mostram só um ponto colorido; no computador o texto já diz a situação. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500 sm:hidden">
          {LEGENDA.map((item) => (
            <li key={item.rotulo} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`size-2 rounded-full ${item.classe}`} />
              {item.rotulo}
            </li>
          ))}
        </ul>
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
