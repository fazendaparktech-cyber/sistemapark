import { isDateOnly } from './dates';
import { MAX_CENTS } from './money';
import { z } from './validation';

export const FINANCE_ENTRY_TYPES = ['INCOME', 'EXPENSE'] as const;

export type FinanceEntryTypeKey = (typeof FINANCE_ENTRY_TYPES)[number];

export const FINANCE_ENTRY_TYPE_LABELS: Readonly<Record<FinanceEntryTypeKey, string>> = {
  INCOME: 'Receita',
  EXPENSE: 'Despesa',
};

export interface FinanceCategory {
  key: string;
  label: string;
}

/** Categorias fixas. A receita dos ingressos não entra aqui: ela vem das vendas. */
export const FINANCE_CATEGORIES: Readonly<Record<FinanceEntryTypeKey, readonly FinanceCategory[]>> = {
  INCOME: [
    { key: 'alimentacao', label: 'Alimentação e bar' },
    { key: 'eventos', label: 'Eventos e aluguel de espaço' },
    { key: 'estacionamento', label: 'Estacionamento' },
    { key: 'locacao', label: 'Locação de armários e boias' },
    { key: 'patrocinio', label: 'Patrocínio e parcerias' },
    { key: 'outras_receitas', label: 'Outras receitas' },
  ],
  EXPENSE: [
    { key: 'folha', label: 'Folha de pagamento' },
    { key: 'energia', label: 'Energia elétrica' },
    { key: 'agua', label: 'Água' },
    { key: 'piscinas', label: 'Tratamento das piscinas' },
    { key: 'manutencao', label: 'Manutenção' },
    { key: 'limpeza', label: 'Limpeza e higiene' },
    { key: 'marketing', label: 'Marketing e anúncios' },
    { key: 'impostos', label: 'Impostos e taxas' },
    { key: 'fornecedores', label: 'Fornecedores' },
    { key: 'seguros', label: 'Seguros' },
    { key: 'outras_despesas', label: 'Outras despesas' },
  ],
};

const ROTULOS = new Map(
  FINANCE_ENTRY_TYPES.flatMap((tipo) =>
    FINANCE_CATEGORIES[tipo].map((categoria) => [`${tipo}:${categoria.key}`, categoria.label] as const),
  ),
);

export function financeCategoryLabel(type: FinanceEntryTypeKey, category: string): string {
  return ROTULOS.get(`${type}:${category}`) ?? category;
}

export const financeEntryInputSchema = z
  .strictObject({
    type: z.enum(FINANCE_ENTRY_TYPES),
    category: z.string().trim().min(1, 'Escolha a categoria'),
    description: z.string().trim().min(2, 'Descreva o lançamento').max(120, 'Use no máximo 120 caracteres'),
    amountCents: z.number().int().min(1, 'Informe o valor').max(MAX_CENTS, 'Valor muito alto'),
    date: z.string().refine(isDateOnly, 'Data inválida'),
    paid: z.boolean(),
    notes: z
      .string()
      .trim()
      .max(500, 'Use no máximo 500 caracteres')
      .nullish()
      .transform((valor) => (valor ? valor : null)),
  })
  .superRefine((valores, ctx) => {
    if (!ROTULOS.has(`${valores.type}:${valores.category}`)) {
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'Escolha a categoria' });
    }
  });

export type FinanceEntryInput = z.input<typeof financeEntryInputSchema>;
