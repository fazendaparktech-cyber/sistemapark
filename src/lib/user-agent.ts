/** Resumo legível de um User-Agent: "Chrome no Android", "Safari no iPhone". Só para exibição. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Dispositivo desconhecido';

  const sistema = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'Mac'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;

  const navegador = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /SamsungBrowser/.test(userAgent)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS/.test(userAgent)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(userAgent)
            ? 'Chrome'
            : /Safari\//.test(userAgent)
              ? 'Safari'
              : null;

  if (navegador && sistema) return `${navegador} no ${sistema}`;
  return navegador ?? sistema ?? 'Dispositivo desconhecido';
}
