/**
 * Política de senha da equipe, seguindo a orientação do NIST: tamanho mínimo,
 * bloqueio de senhas óbvias e sem regras de composição ("uma maiúscula, um
 * símbolo…"), que só levam a senhas previsíveis. Compartilhada entre o
 * formulário (dica em tempo real) e o servidor (quem decide).
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const SENHAS_COMUNS = new Set([
  '0123456789',
  '1234567890',
  '12345678910',
  '1234512345',
  '0987654321',
  'qwertyuiop',
  'asdfghjkla',
  'q1w2e3r4t5',
  '1q2w3e4r5t',
  'password',
  'password1',
  'password12',
  'password123',
  'senha1234',
  'senha12345',
  'senha123456',
  'minhasenha',
  'minhasenha1',
  'minhasenha123',
  'mudar12345',
  'trocar1234',
  'trocar12345',
  'admin12345',
  'admin123456',
  'administrador',
  'administrator',
  'bemvindo123',
  'iloveyou12',
  'abc1234567',
  'abcdefghij',
  'brasil1234',
  'brasil2026',
  'bahia12345',
  'flamengo123',
  'corinthians',
  'palmeiras123',
  'deus123456',
  'jesus12345',
  'conquistapark',
  'conquista2026',
  'conquistapark2026',
  'fazendapark',
  'parqueaquatico',
]);

export type PasswordProblem = 'TOO_SHORT' | 'TOO_LONG' | 'COMMON' | 'CONTAINS_PERSONAL' | 'LOW_VARIETY';

export const PASSWORD_PROBLEM_MESSAGES: Readonly<Record<PasswordProblem, string>> = {
  TOO_SHORT: `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  TOO_LONG: `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
  COMMON: 'Essa senha é muito comum. Escolha outra.',
  CONTAINS_PERSONAL: 'A senha não pode conter seu nome nem seu e-mail.',
  LOW_VARIETY: 'A senha repete demais os mesmos caracteres.',
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export interface PasswordContext {
  email?: string | null;
  name?: string | null;
}

export function checkPassword(password: string, context: PasswordContext = {}): PasswordProblem[] {
  const problemas: PasswordProblem[] = [];
  const tamanho = [...password].length;
  if (tamanho < PASSWORD_MIN_LENGTH) problemas.push('TOO_SHORT');
  if (tamanho > PASSWORD_MAX_LENGTH) problemas.push('TOO_LONG');

  const normalizada = normalizar(password);
  const compacta = normalizada.replace(/[\s\-_.]+/g, '');
  if (SENHAS_COMUNS.has(normalizada) || SENHAS_COMUNS.has(compacta)) problemas.push('COMMON');

  const pessoais = [context.email?.split('@')[0], ...(context.name?.split(/\s+/) ?? [])]
    .map((parte) => normalizar(parte ?? ''))
    .filter((parte) => parte.length >= 4);
  if (pessoais.some((parte) => compacta.includes(parte))) problemas.push('CONTAINS_PERSONAL');

  if (new Set(compacta).size < 4) problemas.push('LOW_VARIETY');
  return problemas;
}

export function describePasswordProblems(problems: readonly PasswordProblem[]): string {
  return problems.map((problema) => PASSWORD_PROBLEM_MESSAGES[problema]).join(' ');
}
