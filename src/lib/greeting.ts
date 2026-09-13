/** "Bom dia", "Boa tarde" ou "Boa noite" no fuso do parque. */
export function greetingFor(timeZone: string, now: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now),
  );
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}
