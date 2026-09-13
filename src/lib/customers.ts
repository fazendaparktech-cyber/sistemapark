import { optionalDateOnlySchema, optionalText } from './person-schemas';
import { emailSchema, optionalPhoneSchema, personNameSchema, z } from './validation';

/** Clientes: formulário de edição e ordenações da lista. */

export const customerUpdateSchema = z.strictObject({
  name: personNameSchema,
  email: emailSchema,
  phone: optionalPhoneSchema,
  birthDate: optionalDateOnlySchema,
  marketingOptIn: z.boolean(),
  notes: optionalText(2000),
});

export type CustomerUpdateInput = z.input<typeof customerUpdateSchema>;

export const CUSTOMER_SORTS = ['recentes', 'gasto', 'pedidos', 'ultima-visita', 'nome'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CUSTOMER_SORT_LABELS: Readonly<Record<CustomerSort, string>> = {
  recentes: 'Cadastro mais recente',
  gasto: 'Maior valor em compras',
  pedidos: 'Mais pedidos',
  'ultima-visita': 'Visita mais recente',
  nome: 'Nome',
};
