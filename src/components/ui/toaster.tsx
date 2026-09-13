'use client';

import { Toaster as Sonner } from 'sonner';

/** Avisos rápidos ("Salvo", "Não foi possível…"). Para erro de campo, use a mensagem no próprio campo. */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      richColors
      closeButton
      duration={4500}
      toastOptions={{
        classNames: {
          toast: 'font-sans rounded-xl shadow-pop',
          title: 'font-semibold',
          description: 'text-[13px]',
        },
      }}
    />
  );
}
