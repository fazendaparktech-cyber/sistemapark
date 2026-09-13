import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { buttonClasses } from './button';

/** Paginação por links (funciona sem JavaScript e mantém os filtros da URL). */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const inicio = (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-500"
    >
      <p className="tabular">
        {inicio}–{fim} de {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={buttonClasses('secondary', 'sm')} rel="prev">
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </Link>
        ) : null}
        <span className="tabular px-1">
          Página {page} de {paginas}
        </span>
        {page < paginas ? (
          <Link href={hrefFor(page + 1)} className={buttonClasses('secondary', 'sm')} rel="next">
            Próxima <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
