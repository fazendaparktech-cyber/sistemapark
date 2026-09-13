import { emailSchema, optionalPhoneSchema, personNameSchema, z } from '@/lib/validation';
import { requireApiAuth } from '@/server/auth/cookies';
import { Errors } from '@/server/errors';
import { ok, readIdParam, readJson, route, type IdRouteContext } from '@/server/http';
import { getUser, updateUser } from '@/server/users/service';

export const GET = route<IdRouteContext>(async ({ ctx }) => {
  const auth = await requireApiAuth();
  return ok(await getUser(auth, await readIdParam(ctx)));
});

const alteracao = z.strictObject({
  name: personNameSchema.optional(),
  email: emailSchema.optional(),
  phone: optionalPhoneSchema.optional(),
});

export const PATCH = route<IdRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const id = await readIdParam(ctx);
  const dados = await readJson(req, alteracao);
  if (Object.keys(dados).length === 0) throw Errors.badRequest('Nada para alterar.');
  return ok(await updateUser(auth, id, dados, meta));
});
