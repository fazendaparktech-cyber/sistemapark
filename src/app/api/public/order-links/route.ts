import { z } from '@/lib/validation';
import { ok, readJson, route } from '@/server/http';
import { requestOrderLinks } from '@/server/orders/public';
import { getPublicPark } from '@/server/parks/public';

const corpo = z.strictObject({ email: z.string().max(254) });

/** "Meus ingressos": a resposta é a mesma exista pedido ou não. */
export const POST = route(async ({ req, meta }) => {
  const { email } = await readJson(req, corpo);
  const parque = await getPublicPark();
  await requestOrderLinks({ park: parque, email, meta });
  return ok({ sent: true });
});
