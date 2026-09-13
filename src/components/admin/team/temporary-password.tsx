'use client';

import { KeyRound } from 'lucide-react';

import { Alert } from '../../ui/alert';
import { CopyButton } from '../../ui/copy-button';

/** Mostra a senha temporária uma única vez, com instruções de entrega. */
export function TemporaryPassword({ password, personName }: { password: string; personName: string }) {
  const primeiroNome = personName.trim().split(/\s+/)[0] ?? personName;
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl bg-ink-950 px-4 py-5 text-center text-white">
        <p className="flex items-center justify-center gap-2 text-[13px] font-medium text-white/70">
          <KeyRound className="size-4" aria-hidden /> Senha temporária
        </p>
        <p className="mt-2 select-all break-all font-mono text-[22px] font-medium tracking-[0.06em]">
          {password}
        </p>
      </div>
      <CopyButton value={password} label="Copiar senha" className="w-full" />
      <Alert tone="warning" title="Ela não aparece de novo">
        Entregue a senha para {primeiroNome} pessoalmente ou por um canal seguro. No primeiro acesso o sistema
        pede uma senha nova, só dela.
      </Alert>
    </div>
  );
}
