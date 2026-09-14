import { ok, readJson, route } from '@/server/http';
import { getPublicPark } from '@/server/parks/public';
import { cartSelectionSchema, createCart, getCartView, releaseCart } from '@/server/sales/cart';
import { clearCartCookie, readCartToken, setCartCookie } from '@/server/sales/cart-cookie';

export const GET = route(async () => {
  const parque = await getPublicPark();
  return ok(await getCartView(parque.id, await readCartToken()));
});

/** Escolha de data e ingressos: segura as vagas enquanto a pessoa preenche os dados. */
export const POST = route(async ({ req, meta }) => {
  const selecao = await readJson(req, cartSelectionSchema);
  const parque = await getPublicPark();
  const { token, cart } = await createCart({
    park: parque,
    selection: selecao,
    previousToken: await readCartToken(),
    meta,
  });
  await setCartCookie(token, cart.expiresAt);
  return ok(cart, { status: 201 });
});

/** Desistiu ou quer mudar a escolha: libera as vagas na hora. */
export const DELETE = route(async () => {
  const parque = await getPublicPark();
  await releaseCart(parque.id, await readCartToken());
  await clearCartCookie();
  return ok({ released: true });
});
