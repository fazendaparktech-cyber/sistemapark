import { optionalDateOnlySchema, optionalText } from './person-schemas';
import { DAY_KINDS } from './pricing';
import { z } from './validation';

/** Tipos de ingresso: rótulos e esquemas usados pelo painel e pelo servidor. */

export const TICKET_CATEGORIES = [
  'ADULT',
  'CHILD',
  'HALF',
  'SENIOR',
  'PROMO',
  'VIP',
  'COURTESY',
  'GROUP',
  'EXCURSION',
  'FAMILY',
  'SPECIAL',
] as const;
export type TicketCategoryKey = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Readonly<Record<TicketCategoryKey, string>> = {
  ADULT: 'Adulto',
  CHILD: 'Infantil',
  HALF: 'Meia-entrada',
  SENIOR: 'Idoso',
  PROMO: 'Promocional',
  VIP: 'VIP',
  COURTESY: 'Cortesia',
  GROUP: 'Grupo',
  EXCURSION: 'Excursão',
  FAMILY: 'Família',
  SPECIAL: 'Especial',
};

export const HOLDER_DATA_OPTIONS = [
  'NONE',
  'NAME',
  'NAME_BIRTHDATE',
  'NAME_CPF',
  'NAME_CPF_BIRTHDATE',
] as const;
export type HolderDataKey = (typeof HOLDER_DATA_OPTIONS)[number];

export const HOLDER_DATA_LABELS: Readonly<Record<HolderDataKey, string>> = {
  NONE: 'Não pedir dados',
  NAME: 'Nome',
  NAME_BIRTHDATE: 'Nome e data de nascimento',
  NAME_CPF: 'Nome e CPF',
  NAME_CPF_BIRTHDATE: 'Nome, CPF e data de nascimento',
};

/** O que perguntar sobre cada visitante. */
export function holderRequirements(holderData: HolderDataKey): {
  name: boolean;
  cpf: boolean;
  birthDate: boolean;
} {
  return {
    name: holderData !== 'NONE',
    cpf: holderData === 'NAME_CPF' || holderData === 'NAME_CPF_BIRTHDATE',
    birthDate: holderData === 'NAME_BIRTHDATE' || holderData === 'NAME_CPF_BIRTHDATE',
  };
}

export const SALES_CHANNELS = ['ONLINE', 'POS'] as const;
export type SalesChannelKey = (typeof SALES_CHANNELS)[number];

export const SALES_CHANNEL_LABELS: Readonly<Record<SalesChannelKey, string>> = {
  ONLINE: 'Site',
  POS: 'Bilheteria',
};

function semRepetir<T>(lista: readonly T[]): T[] {
  return [...new Set(lista)];
}

function valorEmCentavos(mensagem: string) {
  return z
    .number({ error: mensagem })
    .int(mensagem)
    .min(0, 'O valor não pode ser negativo')
    .max(1_000_000, 'Valor muito alto');
}

function limiteOpcional(maximo: number) {
  return z
    .number()
    .int()
    .min(1, 'Use um número maior que zero')
    .max(maximo, `Use no máximo ${maximo}`)
    .nullable();
}

export const ticketTypeInputSchema = z
  .strictObject({
    name: z.string().trim().min(2, 'Informe o nome do ingresso').max(60, 'Use no máximo 60 caracteres'),
    description: optionalText(300),
    category: z.enum(TICKET_CATEGORIES, { error: 'Escolha a categoria' }),
    basePriceCents: valorEmCentavos('Informe o preço'),
    minAge: z.number().int().min(0, 'Idade inválida').max(120, 'Idade inválida').nullable(),
    maxAge: z.number().int().min(0, 'Idade inválida').max(120, 'Idade inválida').nullable(),
    holderData: z.enum(HOLDER_DATA_OPTIONS),
    requiresDocument: z.boolean(),
    documentHint: optionalText(120),
    occupiesCapacity: z.boolean(),
    peoplePerTicket: z.number().int().min(1, 'Use pelo menos 1 pessoa').max(20, 'Use no máximo 20 pessoas'),
    dailyQuota: limiteOpcional(100_000),
    minPerOrder: limiteOpcional(100),
    maxPerOrder: limiteOpcional(100),
    maxPerCustomerPerDay: limiteOpcional(100),
    channels: z
      .array(z.enum(SALES_CHANNELS))
      .min(1, 'Escolha onde o ingresso é vendido')
      .transform(semRepetir),
    availableFrom: optionalDateOnlySchema,
    availableUntil: optionalDateOnlySchema,
    rulesText: optionalText(1000),
    isActive: z.boolean(),
  })
  .superRefine((valores, ctx) => {
    if (valores.minAge !== null && valores.maxAge !== null && valores.minAge > valores.maxAge) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxAge'],
        message: 'A idade máxima precisa ser maior ou igual à mínima',
      });
    }
    if (
      valores.minPerOrder !== null &&
      valores.maxPerOrder !== null &&
      valores.minPerOrder > valores.maxPerOrder
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxPerOrder'],
        message: 'O máximo por pedido precisa ser maior ou igual ao mínimo',
      });
    }
    if (valores.availableFrom && valores.availableUntil && valores.availableFrom > valores.availableUntil) {
      ctx.addIssue({
        code: 'custom',
        path: ['availableUntil'],
        message: 'O fim precisa ser igual ou depois do início',
      });
    }
    if (valores.requiresDocument && !valores.documentHint) {
      ctx.addIssue({
        code: 'custom',
        path: ['documentHint'],
        message: 'Diga qual documento o visitante precisa apresentar',
      });
    }
  });

export type TicketTypeInput = z.input<typeof ticketTypeInputSchema>;

export const priceRuleInputSchema = z
  .strictObject({
    name: z.string().trim().min(2, 'Dê um nome para a regra').max(60, 'Use no máximo 60 caracteres'),
    priceCents: valorEmCentavos('Informe o preço'),
    compareAtCents: z.number().int().min(1).max(1_000_000).nullable(),
    dayKinds: z.array(z.enum(DAY_KINDS)).transform(semRepetir),
    visitFrom: optionalDateOnlySchema,
    visitUntil: optionalDateOnlySchema,
    /** Dias do parque, com as duas pontas incluídas. */
    saleFrom: optionalDateOnlySchema,
    saleUntil: optionalDateOnlySchema,
    lotQuantity: limiteOpcional(1_000_000),
    priority: z.number().int().min(-100, 'Use de -100 a 100').max(100, 'Use de -100 a 100'),
    isActive: z.boolean(),
  })
  .superRefine((valores, ctx) => {
    if (valores.compareAtCents !== null && valores.compareAtCents <= valores.priceCents) {
      ctx.addIssue({
        code: 'custom',
        path: ['compareAtCents'],
        message: 'O preço "de" precisa ser maior que o preço da regra',
      });
    }
    if (valores.visitFrom && valores.visitUntil && valores.visitFrom > valores.visitUntil) {
      ctx.addIssue({
        code: 'custom',
        path: ['visitUntil'],
        message: 'O fim precisa ser igual ou depois do início',
      });
    }
    if (valores.saleFrom && valores.saleUntil && valores.saleFrom > valores.saleUntil) {
      ctx.addIssue({
        code: 'custom',
        path: ['saleUntil'],
        message: 'O fim precisa ser igual ou depois do início',
      });
    }
  });

export type PriceRuleInput = z.input<typeof priceRuleInputSchema>;
