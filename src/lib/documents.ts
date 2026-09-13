/**
 * CPF e telefone: validação, normalização e máscaras.
 *
 * O CPF completo não é gravado no banco. O servidor guarda um HMAC (para busca
 * exata) e a versão mascarada (para exibição) — ver `src/server/crypto.ts`.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function digitoVerificador(digitos: readonly number[], tamanho: number): number {
  let soma = 0;
  for (let i = 0; i < tamanho; i++) soma += (digitos[i] ?? 0) * (tamanho + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digitos = cpf.split('').map(Number);
  return digitoVerificador(digitos, 9) === digitos[9] && digitoVerificador(digitos, 10) === digitos[10];
}

/** "52998224725" → "***.982.247-**". Recusa o que não for um CPF de 11 dígitos. */
export function maskCpf(value: string): string {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) throw new RangeError('CPF deve ter 11 dígitos');
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

/** Formata enquanto a pessoa digita: "5299822" → "529.982.2". */
export function formatCpfInput(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** DDDs em uso no Brasil (Anatel). */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46,
  47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85,
  86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Normaliza telefone brasileiro para E.164 sem o "+": "(73) 99999-8888" →
 * "5573999998888". Devolve `null` se não for um número válido.
 */
export function normalizePhoneBR(value: string): string | null {
  let d = onlyDigits(value);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length !== 10 && d.length !== 11) return null;
  if (!DDDS.has(Number(d.slice(0, 2)))) return null;
  if (d.length === 11 && d[2] !== '9') return null;
  if (d.length === 10 && !/[2-5]/.test(d[2] ?? '')) return null;
  return `55${d}`;
}

/** "5573999998888" → "(73) 99999-8888"; "557332221111" → "(73) 3222-1111". */
export function formatPhoneBR(e164: string): string {
  const d = onlyDigits(e164).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}
