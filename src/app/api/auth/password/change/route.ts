import { requireApiAuth } from '@/server/auth/cookies';
import { changePassword } from '@/server/auth/service';
import { ok, readJson, route } from '@/server/http';
import { passwordInputSchema, z } from '@/lib/validation';

const corpo = z.strictObject({
  currentPassword: passwordInputSchema,
  newPassword: passwordInputSchema,
});

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth({ allowPasswordChange: true });
  const dados = await readJson(req, corpo);
  await changePassword(auth, dados, meta);
  return ok({ message: 'Senha alterada.', redirectTo: '/admin' });
});
