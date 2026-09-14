import { z } from '@/lib/validation';
import { ok, readJson, route } from '@/server/http';
import { getPublicPark } from '@/server/parks/public';
import { previewCartCoupon } from '@/server/sales/cart';
import { readCartToken } from '@/server/sales/cart-cookie';

const cupom = z.strictObject({
  code: z.string().trim().min(1, 'Informe o código do cupom').max(30, 'Código de cupom inválido'),
  cpf: z.string().max(20).nullish(),
});

/** Mostra o desconto antes de concluir. A compra confere o cupom de novo. */
export const POST = route(async ({ req, meta }) => {
  const dados = await readJson(req, cupom);
  const parque = await getPublicPark();
  return ok(
    await previewCartCoupon({
      park: parque,
      cartToken: await readCartToken(),
      code: dados.code,
      cpf: dados.cpf ?? null,
      meta,
    }),
  );
});
