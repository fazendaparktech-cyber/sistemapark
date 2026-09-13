import 'server-only';

/** Violação de unicidade no banco (código P2002 do Prisma). */
export function isUniqueViolation(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code?: unknown }).code === 'P2002'
  );
}
