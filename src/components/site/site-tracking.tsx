'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { rememberAttribution } from '@/lib/tracking-client';

/**
 * Em todo o site: guarda a origem da visita já na página de entrada e avisa os
 * pixels a cada troca de página (a primeira visualização o próprio pixel envia).
 */
export function SiteTracking() {
  const pathname = usePathname();
  const paginaAnterior = useRef(pathname);

  useEffect(rememberAttribution, []);

  useEffect(() => {
    if (paginaAnterior.current === pathname) return;
    paginaAnterior.current = pathname;
    try {
      window.fbq?.('track', 'PageView');
      window.ttq?.page();
    } catch {
      // Pixel bloqueado pelo navegador: nada a fazer.
    }
  }, [pathname]);

  return null;
}
