import {
  optionalCpfSchema,
  optionalDateOnlySchema,
  optionalEmailSchema,
  optionalText,
} from './person-schemas';
import { optionalPhoneSchema, personNameSchema, z } from './validation';

/** Clientes: cadastro, edição e ordenações da lista. */

/**
 * Cadastro e edição usam os mesmos campos. Só o nome é obrigatório (cliente do
 * balcão pode não ter e-mail nem CPF). O CPF, depois de informado, não muda.
 */
export const customerFormSchema = z.strictObject({
  name: personNameSchema,
  cpf: optionalCpfSchema,
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  birthDate: optionalDateOnlySchema,
  marketingOptIn: z.boolean(),
  notes: optionalText(2000),
});

export const customerCreateSchema = customerFormSchema;
export const customerUpdateSchema = customerFormSchema;

export type CustomerCreateInput = z.input<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.input<typeof customerUpdateSchema>;

export const CUSTOMER_SORTS = ['recentes', 'gasto', 'pedidos', 'ultima-visita', 'nome'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CUSTOMER_SORT_LABELS: Readonly<Record<CustomerSort, string>> = {
  recentes: 'Cadastro mais recente',
  gasto: 'Maior total gasto',
  pedidos: 'Mais compras',
  'ultima-visita': 'Visita mais recente',
  nome: 'Nome',
};
