import { isDateOnly } from './dates';
import { isValidCpf, normalizePhoneBR, onlyDigits } from './documents';
import { emailSchema, z } from './validation';

/** Campos que se repetem nos formulários de compra e do painel. */

/** CPF válido; devolve só os dígitos. */
export const cpfSchema = z.string({ error: 'Informe o CPF' }).transform((valor, ctx) => {
  const digitos = onlyDigits(valor);
  if (!isValidCpf(digitos)) {
    ctx.addIssue({ code: 'custom', message: 'CPF inválido' });
    return z.NEVER;
  }
  return digitos;
});

/** Celular obrigatório; devolve no formato 55DDNNNNNNNNN. */
export const requiredPhoneSchema = z.string({ error: 'Informe o celular' }).transform((valor, ctx) => {
  const normalizado = normalizePhoneBR(valor);
  if (!normalizado) {
    ctx.addIssue({ code: 'custom', message: 'Informe um celular com DDD, ex.: (73) 99999-8888' });
    return z.NEVER;
  }
  return normalizado;
});

export const dateOnlySchema = z.string({ error: 'Informe a data' }).refine(isDateOnly, 'Data inválida');

/** Data opcional: vazio vira `null`. */
export const optionalDateOnlySchema = z
  .string()
  .nullish()
  .transform((valor) => (valor ? valor : null))
  .refine((valor) => valor === null || isDateOnly(valor), 'Data inválida');

/** E-mail opcional: vazio vira `null`. */
export const optionalEmailSchema = z
  .string()
  .trim()
  .max(254, 'E-mail muito longo')
  .nullish()
  .transform((valor, ctx) => {
    if (!valor) return null;
    const parsed = emailSchema.safeParse(valor);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'Informe um e-mail válido' });
      return z.NEVER;
    }
    return parsed.data;
  });

/** CPF opcional: vazio vira `null`; preenchido precisa ser válido. Devolve só os dígitos. */
export const optionalCpfSchema = z
  .string()
  .max(20, 'CPF inválido')
  .nullish()
  .transform((valor, ctx) => {
    const digitos = onlyDigits(valor ?? '');
    if (!digitos) return null;
    if (!isValidCpf(digitos)) {
      ctx.addIssue({ code: 'custom', message: 'CPF inválido' });
      return z.NEVER;
    }
    return digitos;
  });

/** Texto opcional: vazio vira `null`. */
export function optionalText(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, `Use no máximo ${maximo} caracteres`)
    .nullish()
    .transform((valor) => (valor ? valor : null));
}
