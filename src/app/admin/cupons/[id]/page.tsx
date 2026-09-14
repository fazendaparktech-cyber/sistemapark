import { ArrowLeft, BadgePercent, CircleDollarSign, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CouponActions } from '@/components/admin/coupons/coupon-actions';
import { CouponFormDialog } from '@/components/admin/coupons/coupon-form-dialog';
import { MetricCard } from '@/components/admin/metric-card';
import { NoPermission } from '@/components/admin/no-permission';
import { CouponStateBadge, OrderStatusBadge } from '@/components/admin/status-badges';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { uuidSchema } from '@/lib/validation';
import { describeWeekdays } from '@/lib/weekdays';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { listTicketTypesAdmin } from '@/server/catalog/service';
import { getCouponAdmin, type AdminCouponDetail } from '@/server/coupons/service';
import { isAppError } from '@/server/errors';

export const metadata: Metadata = { title: 'Cupom' };

const USO: Record<
  AdminCouponDetail['usages'][number]['usageStatus'],
  { label: string; tone: 'success' | 'warning' | 'neutral' }
> = {
  CONFIRMED: { label: 'Usado', tone: 'success' },
  RESERVED: { label: 'Reservado', tone: 'warning' },
  RELEASED: { label: 'Devolvido', tone: 'neutral' },
};

function Regra({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-ink-500">{rotulo}</dt>
      <dd className="text-right font-medium text-ink-900">{valor}</dd>
    </div>
  );
}

export default async function CupomPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  if (!can(auth, 'coupons.view')) return <NoPermission />;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let cupom: AdminCouponDetail;
  try {
    cupom = await getCouponAdmin(auth, id);
  } catch (erro) {
    if (isAppError(erro) && erro.code === 'NOT_FOUND') notFound();
    throw erro;
  }

  const podeGerenciar = can(auth, 'coupons.manage');
  const tipos = podeGerenciar && can(auth, 'ticket_types.view') ? await listTicketTypesAdmin(auth) : [];
  const fuso = auth.park.timezone;
  const totalDeUsos = cupom.usages.length;

  const periodo =
    cupom.startsOn || cupom.endsOn
      ? `${cupom.startsOn ? formatDateBR(cupom.startsOn) : 'Desde a criação'} até ${cupom.endsOn ? formatDateBR(cupom.endsOn) : 'sem prazo'}`
      : 'Sem prazo';
  const visitas =
    cupom.visitFrom || cupom.visitUntil
      ? `${cupom.visitFrom ? formatDateBR(cupom.visitFrom) : 'Qualquer data'} até ${cupom.visitUntil ? formatDateBR(cupom.visitUntil) : 'sem limite'}`
      : 'Qualquer data';

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/cupons"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Cupons
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-pool-700">Cupom</p>
          <h1 className="font-mono text-[26px] font-semibold tracking-tight text-ink-900 sm:text-[30px]">
            {cupom.code}
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            {cupom.summary}
            {cupom.description ? ` · ${cupom.description}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <CouponStateBadge state={cupom.state} />
          </div>
        </div>
        {podeGerenciar ? (
          <div className="flex flex-wrap gap-2">
            <CouponFormDialog
              trigger="edit"
              ticketTypes={tipos.map((tipo) => ({ id: tipo.id, name: tipo.name }))}
              coupon={{
                id: cupom.id,
                code: cupom.code,
                description: cupom.description,
                discountType: cupom.discountType,
                percentBps: cupom.percentBps,
                amountCents: cupom.amountCents,
                maxDiscountCents: cupom.maxDiscountCents,
                minOrderCents: cupom.minOrderCents,
                startsOn: cupom.startsOn,
                endsOn: cupom.endsOn,
                visitFrom: cupom.visitFrom,
                visitUntil: cupom.visitUntil,
                weekdays: cupom.weekdays,
                maxUses: cupom.maxUses,
                maxUsesPerCustomer: cupom.maxUsesPerCustomer,
                firstPurchaseOnly: cupom.firstPurchaseOnly,
                channels: cupom.channels,
                ticketTypeIds: cupom.ticketTypeIds,
                isActive: cupom.isActive,
              }}
            />
            <CouponActions
              couponId={cupom.id}
              code={cupom.code}
              isActive={cupom.isActive}
              canDelete={totalDeUsos === 0}
            />
          </div>
        ) : null}
      </div>

      <section aria-label="Resultado do cupom" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Usos em pedidos pagos"
          value={formatNumber(cupom.usage.confirmed)}
          hint={
            cupom.usage.reserved > 0
              ? `${formatNumber(cupom.usage.reserved)} aguardando pagamento`
              : cupom.maxUses !== null
                ? `limite de ${formatNumber(cupom.maxUses)}`
                : 'sem limite de usos'
          }
          icon={Users}
        />
        <MetricCard
          label="Descontos concedidos"
          value={formatBRL(cupom.usage.discountCents)}
          icon={BadgePercent}
          tone="sun"
        />
        <MetricCard
          label="Vendas com o cupom"
          value={formatBRL(cupom.usage.revenueCents)}
          icon={CircleDollarSign}
          tone="citrus"
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card>
          <CardHeader title="Regras" description={`Criado em ${formatDateTimeBR(cupom.createdAt, fuso)}`} />
          <CardContent className="pt-2">
            <dl className="divide-y divide-ink-100">
              <Regra rotulo="Desconto" valor={cupom.summary} />
              <Regra
                rotulo="Compra mínima"
                valor={cupom.minOrderCents ? formatBRL(cupom.minOrderCents) : 'Sem mínimo'}
              />
              <Regra rotulo="Pode ser usado" valor={periodo} />
              <Regra rotulo="Datas de visita" valor={visitas} />
              <Regra rotulo="Dias da semana" valor={describeWeekdays(cupom.weekdays)} />
              <Regra
                rotulo="Usos no total"
                valor={cupom.maxUses !== null ? formatNumber(cupom.maxUses) : 'Sem limite'}
              />
              <Regra
                rotulo="Usos por CPF"
                valor={
                  cupom.maxUsesPerCustomer !== null ? formatNumber(cupom.maxUsesPerCustomer) : 'Sem limite'
                }
              />
              <Regra
                rotulo="Primeira compra"
                valor={cupom.firstPurchaseOnly ? 'Só na primeira compra' : 'Qualquer compra'}
              />
              <Regra
                rotulo="Onde vale"
                valor={cupom.channels
                  .map((canal) => (canal === 'ONLINE' ? 'Online' : 'Presencial'))
                  .join(' e ')}
              />
              <Regra
                rotulo="Ingressos"
                valor={cupom.ticketTypeNames.length > 0 ? cupom.ticketTypeNames.join(', ') : 'Todos'}
              />
            </dl>
          </CardContent>
        </Card>

        <section className="grid gap-3" aria-labelledby="usos-do-cupom">
          <h2 id="usos-do-cupom" className="font-display text-[17px] font-semibold text-ink-900">
            Pedidos com este cupom
          </h2>
          {cupom.usages.length === 0 ? (
            <Card>
              <EmptyState
                icon={BadgePercent}
                title="Nenhum uso ainda"
                description="Os pedidos com o cupom aparecem aqui."
              />
            </Card>
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Pedido</TH>
                    <TH>Visita</TH>
                    <TH className="text-right">Desconto</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Uso</TH>
                  </tr>
                </THead>
                <TBody>
                  {cupom.usages.map((uso) => (
                    <TR key={uso.orderId} className="hover:bg-pool-50/40">
                      <TD className="max-w-56">
                        {can(auth, 'orders.view') ? (
                          <Link
                            href={`/admin/vendas/${uso.orderId}`}
                            className="font-mono text-[13px] font-semibold text-ink-900 hover:text-pool-800"
                          >
                            {uso.orderCode}
                          </Link>
                        ) : (
                          <span className="font-mono text-[13px] font-semibold">{uso.orderCode}</span>
                        )}
                        <p className="truncate text-xs text-ink-500">{uso.buyerName}</p>
                      </TD>
                      <TD className="whitespace-nowrap">{formatDateBR(uso.visitDate)}</TD>
                      <TD className="tabular whitespace-nowrap text-right text-grape-700">
                        -{formatBRL(uso.discountCents)}
                      </TD>
                      <TD className="tabular whitespace-nowrap text-right font-semibold">
                        {formatBRL(uso.totalCents)}
                      </TD>
                      <TD>
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={USO[uso.usageStatus].tone}>{USO[uso.usageStatus].label}</Badge>
                          <OrderStatusBadge status={uso.orderStatus} />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </section>
      </div>
    </div>
  );
}
