/** Perfil do público: cidade informada, região pelo DDD do celular e faixa etária. */

export const BRAZIL_STATES = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;

/** Regiões da Bahia pelo DDD; outros DDDs contam como outros estados. */
export const DDD_REGIONS: Readonly<Record<string, string>> = {
  '71': 'Salvador e Região Metropolitana',
  '73': 'Sul da Bahia',
  '74': 'Norte da Bahia',
  '75': 'Feira de Santana e Recôncavo',
  '77': 'Sudoeste e Oeste da Bahia',
};

export const AGE_BUCKETS = [
  { key: '0-11', label: 'Até 11 anos', max: 11 },
  { key: '12-17', label: '12 a 17 anos', max: 17 },
  { key: '18-24', label: '18 a 24 anos', max: 24 },
  { key: '25-34', label: '25 a 34 anos', max: 34 },
  { key: '35-44', label: '35 a 44 anos', max: 44 },
  { key: '45-59', label: '45 a 59 anos', max: 59 },
  { key: '60+', label: '60 anos ou mais', max: Number.POSITIVE_INFINITY },
] as const;

export function ageBucketOf(idade: number): (typeof AGE_BUCKETS)[number] {
  return AGE_BUCKETS.find((faixa) => idade <= faixa.max) ?? AGE_BUCKETS[AGE_BUCKETS.length - 1]!;
}

/** Fatia de gráfico. Chaves começando com `sem-` são "sem informação" e ficam por último. */
export interface AudienceSlice {
  key: string;
  label: string;
  value: number;
}
