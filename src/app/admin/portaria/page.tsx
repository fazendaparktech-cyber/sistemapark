import type { Metadata } from 'next';

import { GateScanner } from '@/components/admin/checkin/gate-scanner';
import { NoPermission } from '@/components/admin/no-permission';
import { PageHeader } from '@/components/ui/page-header';
import { todayIn } from '@/lib/dates';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';
import { getCheckinSummary } from '@/server/checkin/service';

export const metadata: Metadata = { title: 'Portaria' };

export default async function PortariaPage() {
  const auth = await requirePageAuth();
  const podeLer = can(auth, 'checkin.scan');
  const podeBuscar = can(auth, 'checkin.manual');
  const podeAcompanhar = can(auth, 'checkin.monitor');
  if (!podeLer && !podeBuscar && !podeAcompanhar) return <NoPermission />;

  const resumo = podeAcompanhar ? await getCheckinSummary(auth) : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Portaria"
        description="Leia o QR Code do ingresso ou busque pelo nome, CPF, celular, código ou pedido. Cada ingresso libera uma entrada."
      />
      <GateScanner
        timezone={auth.park.timezone}
        today={todayIn(auth.park.timezone)}
        canScan={podeLer}
        canManual={podeBuscar}
        initialSummary={
          resumo
            ? { ...resumo, recent: resumo.recent.map((item) => ({ ...item, at: item.at.toISOString() })) }
            : null
        }
      />
    </div>
  );
}
