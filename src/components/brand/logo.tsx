import Image from 'next/image';

import { cn } from '../ui/cn';

/** Logo oficial (vetor extraído do arquivo da marca). `light` = versão branca para fundos escuros. */
export function Logo({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <Image
      src={light ? '/brand/conquista-park-branca.svg' : '/brand/conquista-park.svg'}
      alt="Conquista Park"
      width={302}
      height={122}
      unoptimized
      priority
      className={cn('h-10 w-auto', className)}
    />
  );
}
