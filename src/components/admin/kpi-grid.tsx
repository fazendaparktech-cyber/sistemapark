import { Children, isValidElement, type ReactNode } from 'react';

import { cn } from '../ui/cn';

/**
 * Grade de indicadores sem buraco no fim: em cada tamanho de tela, os cartões
 * da última linha se dividem para ocupar a largura toda.
 */

const TELAS = [
  { colunas: 2, classes: ['', 'min-[480px]:col-span-1', 'min-[480px]:col-span-2'] },
  { colunas: 3, classes: ['', 'lg:col-span-1', 'lg:col-span-2', 'lg:col-span-3'] },
  { colunas: 4, classes: ['', 'xl:col-span-1', 'xl:col-span-2', 'xl:col-span-3', 'xl:col-span-4'] },
  {
    colunas: 5,
    classes: ['', '2xl:col-span-1', '2xl:col-span-2', '2xl:col-span-3', '2xl:col-span-4', '2xl:col-span-5'],
  },
] as const;

function largura(total: number, indice: number, colunas: number): number {
  const sobra = total % colunas;
  if (sobra === 0 || indice < total - sobra) return 1;
  const base = Math.floor(colunas / sobra);
  return indice === total - 1 ? colunas - base * (sobra - 1) : base;
}

export function KpiGrid({ children }: { children: ReactNode }) {
  const cartoes = Children.toArray(children);
  return (
    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {cartoes.map((cartao, indice) => (
        <div
          key={isValidElement(cartao) && cartao.key !== null ? cartao.key : indice}
          className={cn(
            'grid',
            ...TELAS.map(({ colunas, classes }) => classes[largura(cartoes.length, indice, colunas)]),
          )}
        >
          {cartao}
        </div>
      ))}
    </div>
  );
}
