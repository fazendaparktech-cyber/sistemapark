import { onlyDigits } from './documents';
import { emailSchema, optionalPhoneSchema, z } from './validation';

/**
 * Configurações do parque: esquemas (servidor e formulários usam os mesmos),
 * valores padrão e textos iniciais das políticas.
 */

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Campo de texto opcional: vazio vira `null`. */
function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, `Use no máximo ${maximo} caracteres`)
    .nullish()
    .transform((valor) => (valor ? valor : null));
}

// ─── Vendas online ──────────────────────────────────────────────────────────

export const salesSettingsSchema = z.strictObject({
  onlineSalesEnabled: z.boolean(),
  cartHoldMinutes: z.number().int().min(5, 'Mínimo de 5 minutos').max(30, 'Máximo de 30 minutos'),
  paymentWindowMinutes: z.number().int().min(10, 'Mínimo de 10 minutos').max(120, 'Máximo de 120 minutos'),
  maxTicketsPerOrder: z.number().int().min(1, 'Mínimo de 1 ingresso').max(100, 'Máximo de 100 ingressos'),
  maxDaysAhead: z.number().int().min(1, 'Mínimo de 1 dia').max(365, 'Máximo de 365 dias'),
  /** Hora limite para comprar para o próprio dia. `null`: sem limite. */
  sameDaySalesUntil: z.string().regex(HORA, 'Use o formato HH:MM').nullable(),
});

export type SalesSettings = z.infer<typeof salesSettingsSchema>;

export const DEFAULT_SALES_SETTINGS: SalesSettings = {
  onlineSalesEnabled: true,
  cartHoldMinutes: 15,
  paymentWindowMinutes: 30,
  maxTicketsPerOrder: 20,
  maxDaysAhead: 120,
  sameDaySalesUntil: '14:00',
};

// ─── Dados do parque ────────────────────────────────────────────────────────

export const parkProfileSchema = z.strictObject({
  name: z.string().trim().min(2, 'Informe o nome do parque').max(120, 'Nome muito longo'),
  legalName: textoOpcional(160),
  cnpj: z
    .string()
    .nullish()
    .transform((valor, ctx) => {
      const digitos = onlyDigits(valor ?? '');
      if (!digitos) return null;
      if (digitos.length !== 14) {
        ctx.addIssue({ code: 'custom', message: 'O CNPJ tem 14 dígitos' });
        return z.NEVER;
      }
      return digitos;
    }),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((valor) => (valor ? valor : null))
    .pipe(emailSchema.nullable()),
  phone: optionalPhoneSchema,
  whatsapp: optionalPhoneSchema,
  addressLine: textoOpcional(200),
  city: textoOpcional(80),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .nullish()
    .transform((valor) => (valor ? valor : null))
    .pipe(
      z
        .string()
        .regex(/^[A-Z]{2}$/, 'Use a sigla do estado, ex.: BA')
        .nullable(),
    ),
  postalCode: z
    .string()
    .nullish()
    .transform((valor, ctx) => {
      const digitos = onlyDigits(valor ?? '');
      if (!digitos) return null;
      if (digitos.length !== 8) {
        ctx.addIssue({ code: 'custom', message: 'O CEP tem 8 dígitos' });
        return z.NEVER;
      }
      return digitos;
    }),
  orderCodePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,6}$/, 'Use de 1 a 6 letras, sem acento'),
});

export type ParkProfileInput = z.input<typeof parkProfileSchema>;
export type ParkProfile = z.output<typeof parkProfileSchema>;

// ─── Políticas ──────────────────────────────────────────────────────────────

export const policiesSchema = z.strictObject({
  cancellation: z.string().trim().min(20, 'Escreva a política de cancelamento').max(20_000),
  terms: z.string().trim().min(20, 'Escreva os termos de uso').max(20_000),
  privacy: z.string().trim().min(20, 'Escreva a política de privacidade').max(20_000),
});

export type Policies = z.infer<typeof policiesSchema>;

export const POLICY_LABELS: Readonly<Record<keyof Policies, string>> = {
  cancellation: 'Política de cancelamento',
  terms: 'Termos de uso e compra',
  privacy: 'Política de privacidade',
};

export const DEFAULT_POLICIES: Policies = {
  cancellation: `1. Desistência da compra online
Compras feitas pelo site podem ser canceladas em até 7 (sete) dias corridos a partir da data da compra, conforme o artigo 49 do Código de Defesa do Consumidor, com devolução integral do valor pago, desde que os ingressos não tenham sido utilizados.

2. Como pedir o cancelamento
Envie o número do pedido para o atendimento do parque pelos canais da página de contato. O reembolso é feito pelo mesmo meio de pagamento usado na compra.

3. Parque fechado
Se o parque não abrir na data da visita por decisão da administração, por exemplo por condições climáticas, você pode escolher uma nova data ou receber o reembolso integral.

4. Ingressos utilizados
Ingressos com entrada registrada na portaria não podem ser cancelados nem reembolsados.`,
  terms: `1. Ingressos
Cada ingresso vale para uma pessoa, somente na data escolhida na compra, e dá direito a uma entrada no parque.

2. QR Code
O ingresso é o QR Code liberado depois da confirmação do pagamento. Ele pode ser usado uma única vez: a primeira leitura na portaria libera a entrada e qualquer cópia deixa de valer. Não compartilhe o QR Code.

3. Meia-entrada e categorias com desconto
Ingressos de meia-entrada, idoso e outras categorias com desconto exigem documento que comprove o direito, apresentado na entrada.

4. Crianças
Crianças devem estar acompanhadas de um responsável maior de idade durante toda a permanência no parque.

5. Regras do parque
O visitante deve seguir as orientações da equipe e as regras de uso de cada atração. O parque pode recusar a entrada ou pedir a saída de quem colocar em risco a própria segurança ou a de outras pessoas.

6. Pagamento
A compra só é confirmada depois da aprovação do pagamento. Pedidos não pagos dentro do prazo são cancelados automaticamente e as vagas voltam a ficar disponíveis.`,
  privacy: `1. Dados coletados
Coletamos apenas o necessário para a venda e a entrada no parque: nome, e-mail, telefone e CPF de quem compra e, quando o tipo de ingresso exige, nome e data de nascimento dos visitantes.

2. Para que usamos
Para emitir e enviar os ingressos, confirmar pagamentos, liberar a entrada na portaria, prestar atendimento e cumprir obrigações legais. Mensagens promocionais só são enviadas a quem autorizar.

3. CPF
O número do CPF não é armazenado por completo: guardamos uma versão protegida, usada apenas para localizar compras, e uma versão mascarada para exibição.

4. Compartilhamento
Os dados são compartilhados somente com os serviços necessários à operação, como o processamento de pagamentos e o envio de e-mails, e nunca são vendidos.

5. Segurança e guarda
Os dados ficam em ambiente protegido, com acesso restrito à equipe autorizada e registro de todos os acessos. São guardados pelo tempo necessário à finalidade e às obrigações legais.

6. Seus direitos
Você pode pedir acesso, correção ou exclusão dos seus dados, e revogar autorizações, pelos canais de atendimento do parque.`,
};

// ─── Funcionamento ──────────────────────────────────────────────────────────

export const operationsSettingsSchema = z
  .strictObject({
    openWeekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Escolha ao menos um dia da semana')
      .transform((dias) => [...new Set(dias)].sort()),
    opensAt: z.string().regex(HORA, 'Use o formato HH:MM'),
    closesAt: z.string().regex(HORA, 'Use o formato HH:MM'),
    capacity: z.number().int().min(1, 'Mínimo de 1 pessoa').max(100_000, 'Capacidade muito alta'),
  })
  .superRefine((valores, ctx) => {
    if (valores.opensAt >= valores.closesAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['closesAt'],
        message: 'O fechamento precisa ser depois da abertura',
      });
    }
  });

export type OperationsSettings = z.output<typeof operationsSettingsSchema>;

export const DEFAULT_OPERATIONS_SETTINGS: OperationsSettings = {
  openWeekdays: [0, 6],
  opensAt: '09:00',
  closesAt: '17:00',
  capacity: 1000,
};

// ─── Logo ───────────────────────────────────────────────────────────────────

export const PARK_LOGO_MAX_BYTES = 300_000;

/** Imagem em data URL (base64). O servidor confere o tipo pelos bytes, não pelo nome. */
export const parkLogoSchema = z.strictObject({
  dataUrl: z.string().max(450_000, 'A imagem passa de 300 KB'),
});
