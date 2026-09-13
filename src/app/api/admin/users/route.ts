import { ROLE_KEYS } from '@/lib/access';
import { emailSchema, optionalPhoneSchema, personNameSchema, z } from '@/lib/validation';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readJson, readQuery, route } from '@/server/http';
import { createUser, listUsers } from '@/server/users/service';

const filtros = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
  role: z.enum(ROLE_KEYS).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});

export const GET = route(async ({ req }) => {
  const auth = await requireApiAuth();
  return ok(await listUsers(auth, readQuery(req, filtros)));
});

const novaPessoa = z.strictObject({
  name: personNameSchema,
  email: emailSchema,
  phone: optionalPhoneSchema,
  roles: z.array(z.string().max(40)).min(1, 'Escolha ao menos um papel').max(ROLE_KEYS.length),
});

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, novaPessoa);
  const resultado = await createUser(auth, dados, meta);
  return ok(resultado, { status: 201 });
});
