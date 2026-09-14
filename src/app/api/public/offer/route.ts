import { isDateOnly } from '@/lib/dates';
import { z } from '@/lib/validation';
import { ok, readQuery, route } from '@/server/http';
import { getPublicPark } from '@/server/parks/public';
import { getPublicDateOffer } from '@/server/sales/availability';

const consulta = z.object({ data: z.string().refine(isDateOnly, 'Data inválida') });

/** Ingressos à venda na data escolhida, com preço do momento. */
export const GET = route(async ({ req }) => {
  const { data } = readQuery(req, consulta);
  const parque = await getPublicPark();
  return ok(await getPublicDateOffer(parque, data));
});
