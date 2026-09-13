import { setSessionCookie } from '@/server/auth/cookies';
import { login } from '@/server/auth/service';
import { ok, readJson, route } from '@/server/http';
import { emailSchema, passwordInputSchema, z } from '@/lib/validation';

const corpo = z.strictObject({
  email: emailSchema,
  password: passwordInputSchema,
});

export const POST = route(async ({ req, meta }) => {
  const dados = await readJson(req, corpo);
  const resultado = await login(dados, meta);
  await setSessionCookie(resultado.token, resultado.expiresAt);
  return ok({
    mustChangePassword: resultado.mustChangePassword,
    redirectTo: resultado.mustChangePassword ? '/trocar-senha' : '/admin',
  });
});
