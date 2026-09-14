import { BadgePercent, ChevronRight, CircleDollarSign, TicketPercent, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CouponFormDialog } from '@/components/admin/coupons/coupon-form-dialog';
import { MetricCard } from '@/components/admin/metric-card';
import { NoPermission } from '@/components/admin/no-permission';
import { CouponStateBadge } from '@/components/admin/status-badges';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { listTicketTypesAdmin } from '@/server/catalog/service';
import { listCouponsAdmin, type AdminCoupon } from '@/server/coupons/service';

export const metadata: Metadata = { title: 'Cupons' };

function validade(cupom: AdminCoupon): string {
  if (cupom.startsOn && cupom.endsOn)
    return `${formatDateBR(cupom.startsOn)} a ${formatDateBR(cupom.endsOn)}`;
  if (cupom.endsOn) return `Até ${formatDateBR(cupom.endsOn)}`;
  if (cupom.startsOn) return `A partir de ${formatDateBR(cupom.startsOn)}`;
  return 'Sem prazo';
}

function usos(cupom: AdminCoupon): string {
  const usados = cupom.usage.confirmed + cupom.usage.reserved;
  return cupom.maxUses !== null
    ? `${formatNumber(usados)} de ${formatNumber(cupom.maxUses)}`
    : formatNumber(usados);
}

export default async function CuponsPage() {
  const auth = await requirePageAuth();
  if (!can(auth, 'coupons.view')) return <NoPermission />;

  const podeGerenciar = can(auth, 'coupons.manage');
  const [cupons, tipos] = await Promise.all([
    listCouponsAdmin(auth),
    podeGerenciar && can(auth, 'ticket_types.view') ? listTicketTypesAdmin(auth) : Promise.resolve([]),
  ]);
  const opcoesDeIngresso = tipos.map((tipo) => ({ id: tipo.id, name: tipo.name }));

  const valendo = cupons.filter((cupom) => cupom.state === 'ACTIVE').length;
  const usosConfirmados = cupons.reduce((soma, cupom) => soma + cupom.usage.confirmed, 0);
  const descontos = cupons.reduce((soma, cupom) => soma + cupom.usage.discountCents, 0);
  const receita = cupons.reduce((soma, cupom) => soma + cupom.usage.revenueCents, 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Cupons de desconto"
        description="Crie códigos promocionais com percentual ou valor, validade, dias, limites e ingressos."
        actions={podeGerenciar ? <CouponFormDialog ticketTypes={opcoesDeIngresso} /> : null}
      />

      <section
        aria-label="Resumo dos cupons"
        className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Cupons valendo"
          value={formatNumber(valendo)}
          hint={`${formatNumber(cupons.length)} cadastrados`}
          icon={TicketPercent}
        />
        <MetricCard
          label="Usos em pedidos pagos"
          value={formatNumber(usosConfirmados)}
          hint="Desde a criação de cada cupom"
          icon={Users}
          tone="grape"
        />
        <MetricCard
          label="Descontos concedidos"
          value={formatBRL(descontos)}
          hint="Em pedidos pagos"
          icon={BadgePercent}
          tone="sun"
        />
        <MetricCard
          label="Vendas com cupom"
          value={formatBRL(receita)}
          hint="Total pago nesses pedidos"
          icon={CircleDollarSign}
          tone="citrus"
        />
      </section>

      {cupons.length === 0 ? (
        <Card>
          <EmptyState
            icon={TicketPercent}
            title="Nenhum cupom criado"
            description="Cupons ajudam em campanhas: datas de pouco movimento, parcerias, aniversariantes e divulgação."
            action={podeGerenciar ? <CouponFormDialog ticketTypes={opcoesDeIngresso} /> : null}
          />
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {cupons.map((cupom) => (
              <li key={cupom.id}>
                <Link
                  href={`/admin/cupons/${cupom.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-200/70 active:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono font-semibold text-ink-900">{cupom.code}</p>
                      <CouponStateBadge state={cupom.state} />
                    </div>
                    <p className="mt-0.5 text-sm text-ink-700">{cupom.summary}</p>
                    <p className="text-[13px] text-ink-500">
                      {validade(cupom)} · {usos(cupom)}{' '}
                      {cupom.usage.confirmed + cupom.usage.reserved === 1 ? 'uso' : 'usos'}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <TableContainer className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Cupom</TH>
                  <TH>Desconto</TH>
                  <TH>Validade</TH>
                  <TH className="text-right">Usos</TH>
                  <TH className="text-right">Descontos</TH>
                  <TH className="text-right">Vendas</TH>
                  <TH>Situação</TH>
                  <TH className="w-10">
                    <span className="sr-only">Abrir</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {cupons.map((cupom) => (
                  <TR key={cupom.id} className="hover:bg-pool-50/40">
                    <TD className="max-w-60">
                      <Link
                        href={`/admin/cupons/${cupom.id}`}
                        className="font-mono font-semibold text-ink-900 hover:text-pool-800"
                      >
                        {cupom.code}
                      </Link>
                      {cupom.description ? (
                        <p className="truncate text-xs text-ink-500">{cupom.description}</p>
                      ) : null}
                    </TD>
                    <TD className="text-ink-700">{cupom.summary}</TD>
                    <TD className="whitespace-nowrap text-ink-600">{validade(cupom)}</TD>
                    <TD className="tabular whitespace-nowrap text-right">
                      {usos(cupom)}
                      {cupom.usage.reserved > 0 ? (
                        <p className="text-xs text-ink-500">
                          {formatNumber(cupom.usage.reserved)} aguardando pagamento
                        </p>
                      ) : null}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right">
                      {formatBRL(cupom.usage.discountCents)}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right font-semibold">
                      {formatBRL(cupom.usage.revenueCents)}
                    </TD>
                    <TD>
                      <CouponStateBadge state={cupom.state} />
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/cupons/${cupom.id}`}
                        className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        aria-label={`Abrir cupom ${cupom.code}`}
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </>
      )}
    </div>
  );
}
