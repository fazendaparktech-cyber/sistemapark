import 'server-only';

import { dbToDateOnly, formatDateBR } from '@/lib/dates';

import type { DbClient } from '../db';
import { notify } from '../notifications/service';
import { occupiedPeople } from '../sales/availability';

/** Faixas de ocupação que geram aviso, da mais alta para a mais baixa. */
const FAIXAS = [100, 90, 80] as const;

/**
 * Avisa a gestão quando a ocupação de um dia (vendidos + reservados) chega a
 * 80%, 90% ou 100% da capacidade. Cada faixa avisa uma vez por dia.
 */
export async function notifyCapacityThresholds(
  db: DbClient,
  parkId: string,
  parkDayId: string,
): Promise<void> {
  const dia = await db.parkDay.findUnique({
    where: { id: parkDayId },
    select: { date: true, capacity: true, status: true },
  });
  if (!dia || dia.status !== 'OPEN' || dia.capacity <= 0) return;

  const ocupadas = await occupiedPeople(db, parkDayId);
  const percentual = (ocupadas / dia.capacity) * 100;
  const faixa = FAIXAS.find((limite) => percentual >= limite);
  if (!faixa) return;

  const data = dbToDateOnly(dia.date);
  const livres = Math.max(0, dia.capacity - ocupadas);
  await notify(db, {
    parkId,
    type: 'CAPACITY',
    severity: faixa === 100 ? 'CRITICAL' : 'WARNING',
    title:
      faixa === 100
        ? `Lotação esgotada em ${formatDateBR(data)}`
        : `Lotação em ${faixa}% em ${formatDateBR(data)}`,
    body:
      faixa === 100
        ? `Todas as ${dia.capacity} vagas do dia estão vendidas ou reservadas. Novas vendas para esta data estão bloqueadas.`
        : `${ocupadas} de ${dia.capacity} vagas ocupadas; restam ${livres}. Se for possível receber mais gente, aumente a capacidade no calendário.`,
    href: `/admin/calendario?mes=${data.slice(0, 7)}`,
    permission: 'calendar.view',
    dedupeKey: `lotacao:${data}:${faixa}`,
  });
}
