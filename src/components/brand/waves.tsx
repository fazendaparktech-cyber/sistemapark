import { cn } from '../ui/cn';

/** Linhas de água — o motivo visual da marca nos fundos. Decorativo. */
export function Waves({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 220"
      preserveAspectRatio="none"
      fill="none"
      className={cn('pointer-events-none', className)}
    >
      <path
        d="M0 132C120 104 222 160 344 132S566 104 688 132 800 146 800 146"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M0 164C138 136 244 192 382 164S602 136 724 164 800 176 800 176"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M0 196C128 172 252 220 392 196S612 172 742 196 800 206 800 206"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
