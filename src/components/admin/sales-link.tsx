import { ExternalLink } from 'lucide-react';

import { buttonClasses } from '../ui/button';
import { CopyButton } from '../ui/copy-button';

/** Link público de compra, com copiar e abrir. */
export function SalesLink({ url }: { url: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 basis-60 truncate rounded-xl bg-ink-50 px-3.5 py-2.5 font-mono text-[13px] text-ink-800 ring-1 ring-inset ring-ink-200">
        {url}
      </code>
      <div className="flex w-full shrink-0 gap-2 sm:w-auto">
        <CopyButton value={url} label="Copiar link" className="flex-1 sm:flex-none" />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={buttonClasses('secondary', 'md', 'flex-1 sm:flex-none')}
        >
          <ExternalLink className="size-4" aria-hidden />
          Abrir
        </a>
      </div>
    </div>
  );
}
