import { resetPassword } from '@/server/auth/service';
import { ok, readJson, route } from '@/server/http';
import { passwordInputSchema, z } from '@/lib/validation';

const corpo = z.strictObject({
  token: z.string().min(32, 'Link inválido').max(128, 'Link inválido'),
  password: passwordInputSchema,
});

export const POST = route(async ({ req, meta }) => {
  const dados = await readJson(req, corpo);
  await resetPassword(dados, meta);
  return ok({ message: 'Senha redefinida. Entre com a nova senha.' });
});
