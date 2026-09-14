import 'server-only';

import { formatDateBR, type DateOnly } from '@/lib/dates';

/**
 * Mensagem pronta para a equipe enviar os ingressos pelo WhatsApp do parque
 * (wa.me). Não depende de API: abre a conversa com o texto preenchido.
 */
export function orderWhatsappUrl(input: {
  phone: string;
  parkName: string;
  buyerName: string;
  code: string;
  visitDate: DateOnly;
  publicUrl: string;
  pending: boolean;
}): string {
  const primeiroNome = input.buyerName.trim().split(/\s+/)[0] ?? input.buyerName;
  const data = formatDateBR(input.visitDate);
  const texto = input.pending
    ? `Olá, ${primeiroNome}! Seu pedido ${input.code} para ${input.parkName} no dia ${data} está reservado. Para pagar e receber os ingressos, acesse: ${input.publicUrl}`
    : `Olá, ${primeiroNome}! Seus ingressos para ${input.parkName} no dia ${data} estão prontos (pedido ${input.code}). Apresente o QR Code de cada ingresso na entrada: ${input.publicUrl}`;
  return `https://wa.me/${input.phone}?text=${encodeURIComponent(texto)}`;
}
