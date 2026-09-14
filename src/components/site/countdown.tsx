'use client';

import { useEffect, useState } from 'react';

/** Segundos que faltam até o instante; `null` antes de montar no navegador (evita divergência com o servidor). */
export function useSecondsLeft(until: string | null): number | null {
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    const atualizar = () => setAgora(Date.now());
    const primeiro = setTimeout(atualizar, 0);
    const intervalo = setInterval(atualizar, 1000);
    return () => {
      clearTimeout(primeiro);
      clearInterval(intervalo);
    };
  }, []);

  if (!until || agora === null) return null;
  return Math.max(0, Math.floor((new Date(until).getTime() - agora) / 1000));
}

export function formatSeconds(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}
