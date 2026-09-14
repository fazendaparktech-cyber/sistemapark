import { z } from '@/lib/validation';
import { Errors } from '@/server/errors';
import { ok, readQuery, route } from '@/server/http';
import { getPublicOrderStatus } from '@/server/orders/status';
import { getPublicPark } from '@/server/parks/public';

interface CodeRouteContext {
  params: Promise<{ code: string }>;
}

const consulta = z.object({ t: z.string().max(64) });

/** A página do pedido consulta aqui se o pagamento já foi confirmado. */
export const GET = route<CodeRouteContext>(async ({ req, ctx }) => {
  const { code } = await ctx.params;
  const { t } = readQuery(req, consulta);
  const parque = await getPublicPark();
  const situacao = await getPublicOrderStatus(parque.id, code, t);
  if (!situacao) throw Errors.notFound('Pedido não encontrado.');
  return ok(situacao);
});
