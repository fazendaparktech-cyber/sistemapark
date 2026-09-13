import { z } from 'zod';

import { normalizePhoneBR } from './documents';

/**
 * Zod com mensagens padrão em português e os campos que se repetem pelo
 * sistema. Importe `z` daqui, não direto de 'zod'.
 */
z.config(z.locales.ptBR());

export { z };

export const emailSchema = z
  .string({ error: 'Informe o e-mail' })
  .trim()
  .toLowerCase()
  .max(254, 'E-mail muito longo')
  .pipe(z.email({ error: 'Informe um e-mail válido' }));

export const personNameSchema = z
  .string({ error: 'Informe o nome' })
  .trim()
  .min(3, 'Informe o nome completo')
  .max(120, 'Nome muito longo');

/** Telefone opcional: vazio vira `null`; preenchido precisa ser um número brasileiro válido. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(30, 'Telefone muito longo')
  .nullish()
  .transform((valor, ctx) => {
    if (!valor) return null;
    const normalizado = normalizePhoneBR(valor);
    if (!normalizado) {
      ctx.addIssue({ code: 'custom', message: 'Informe um telefone com DDD, ex.: (73) 99999-8888' });
      return z.NEVER;
    }
    return normalizado;
  });

/** Senha digitada: sem trim (espaço é caractere válido), com teto para não processar textos enormes. */
export const passwordInputSchema = z
  .string({ error: 'Informe a senha' })
  .min(1, 'Informe a senha')
  .max(1024, 'Senha muito longa');

export const uuidSchema = z.uuid({ error: 'Identificador inválido' });
