import { checkoutInputSchema } from '@/lib/orders';
import { ok, readJson, route } from '@/server/http';
import { getPublicPark } from '@/server/parks/public';
import { clearCartCookie, readCartToken } from '@/server/sales/cart-cookie';
import { placeOnlineOrder } from '@/server/sales/checkout';

export const POST = route(async ({ req, meta }) => {
  const dados = await readJson(req, checkoutInputSchema);
  const parque = await getPublicPark();
  const pedido = await placeOnlineOrder({ park: parque, cartToken: await readCartToken(), data: dados, meta });
  await clearCartCookie();
  return ok(
    {
      code: pedido.code,
      status: pedido.status,
      totalCents: pedido.totalCents,
      url: `/pedido/${encodeURIComponent(pedido.code)}?t=${pedido.accessToken}`,
    },
    { status: 201 },
  );
});
