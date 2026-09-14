import { diffDays, isDateOnly } from '@/lib/dates';
import { z } from '@/lib/validation';
import { Errors } from '@/server/errors';
import { ok, readQuery, route } from '@/server/http';
import { getPublicPark } from '@/server/parks/public';
import { getPublicCalendar } from '@/server/sales/availability';

const intervalo = z.object({
  de: z.string().refine(isDateOnly, 'Data inválida'),
  ate: z.string().refine(isDateOnly, 'Data inválida'),
});

/** Situação de cada dia para o calendário de compra (até 3 meses por consulta). */
export const GET = route(async ({ req }) => {
  const { de, ate } = readQuery(req, intervalo);
  const dias = diffDays(de, ate);
  if (dias < 0 || dias > 93) throw Errors.badRequest('Consulte no máximo três meses por vez.');
  const parque = await getPublicPark();
  return ok(await getPublicCalendar(parque, de, ate));
});
