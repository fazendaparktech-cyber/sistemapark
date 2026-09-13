/** "há 5 minutos", "ontem", "há 3 meses" — para datas de acesso e registros recentes. */

const formatador = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

const MINUTO = 60;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export function formatRelativeTime(instant: Date, now: Date = new Date()): string {
  const segundos = Math.round((instant.getTime() - now.getTime()) / 1000);
  const distancia = Math.abs(segundos);
  if (distancia < 45) return 'agora';
  if (distancia < 45 * MINUTO) return formatador.format(Math.round(segundos / MINUTO), 'minute');
  if (distancia < 22 * HORA) return formatador.format(Math.round(segundos / HORA), 'hour');
  if (distancia < 26 * DIA) return formatador.format(Math.round(segundos / DIA), 'day');
  if (distancia < 320 * DIA) return formatador.format(Math.round(segundos / (30 * DIA)), 'month');
  return formatador.format(Math.round(segundos / (365 * DIA)), 'year');
}
