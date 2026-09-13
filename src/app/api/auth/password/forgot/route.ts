import { after } from 'next/server';

import { requestPasswordReset } from '@/server/auth/service';
import { ok, readJson, route } from '@/server/http';
import { emailSchema, z } from '@/lib/validation';

const corpo = z.strictObject({ email: emailSchema });

export const POST = route(async ({ req, meta }) => {
  const { email } = await readJson(req, corpo);
  const entrega = await requestPasswordReset({ email }, meta);
  // O e-mail sai depois da resposta: o tempo de resposta não revela se a conta existe.
  if (entrega) after(entrega);
  return ok({ message: 'Se houver uma conta com este e-mail, as instruções chegam em instantes.' });
});
