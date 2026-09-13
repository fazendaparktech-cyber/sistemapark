import 'server-only';

/**
 * Modelos de e-mail em HTML de tabela (o que os clientes de e-mail entendem),
 * com versão em texto puro. Todo dado variável passa por `escapeHtml`.
 */

const ROXO = '#583C8D';
const TINTA = '#1E1A2E';
const TEXTO_SUAVE = '#5B5570';
const FUNDO = '#F4F7FA';

export function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Layout {
  parkName: string;
  preheader: string;
  title: string;
  paragraphs: string[];
  /** Quadro de informações: rótulo à esquerda, valor à direita. */
  rows?: { label: string; value: string }[];
  links?: { label: string; url: string; detail?: string }[];
  button?: { label: string; url: string };
  footnote?: string;
}

function quadro(rows: Layout['rows']): string {
  if (!rows || rows.length === 0) return '';
  const linhas = rows
    .map((linha, indice) => {
      const borda = indice > 0 ? 'border-top:1px solid #E3E1EB;' : '';
      return `<tr>
        <td style="padding:10px 16px;font-size:14px;color:${TEXTO_SUAVE};${borda}">${escapeHtml(linha.label)}</td>
        <td align="right" style="padding:10px 16px;font-size:14px;font-weight:600;color:${TINTA};${borda}">${escapeHtml(linha.value)}</td>
      </tr>`;
    })
    .join('');
  return `<tr><td style="padding:4px 0 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3E1EB;border-radius:12px">${linhas}</table>
  </td></tr>`;
}

function listaDeLinks(links: Layout['links']): string {
  if (!links || links.length === 0) return '';
  return links
    .map(
      (link) =>
        `<tr><td style="padding:0 0 14px;font-size:15px;line-height:22px">
          <a href="${escapeHtml(link.url)}" style="color:${ROXO};font-weight:600">${escapeHtml(link.label)}</a>${
            link.detail
              ? `<br><span style="font-size:13px;color:${TEXTO_SUAVE}">${escapeHtml(link.detail)}</span>`
              : ''
          }
        </td></tr>`,
    )
    .join('');
}

function quadroEmTexto(rows: Layout['rows']): string {
  return (rows ?? []).map((linha) => `${linha.label}: ${linha.value}`).join('\n');
}

function layout({ parkName, preheader, title, paragraphs, rows, links, button, footnote }: Layout): string {
  const botao = button
    ? `<tr><td style="padding:8px 0 24px">
         <a href="${escapeHtml(button.url)}" style="display:inline-block;background:${ROXO};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:10px">${escapeHtml(button.label)}</a>
       </td></tr>`
    : '';
  const paragrafos = paragraphs
    .map(
      (p) =>
        `<tr><td style="padding:0 0 16px;font-size:16px;line-height:24px;color:${TINTA}">${escapeHtml(p)}</td></tr>`,
    )
    .join('');
  const nota = footnote
    ? `<tr><td style="padding:16px 0 0;font-size:13px;line-height:20px;color:${TEXTO_SUAVE};border-top:1px solid #E3E1EB">${escapeHtml(footnote)}</td></tr>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${FUNDO};font-family:Arial,Helvetica,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FUNDO}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px">
      <tr><td style="padding:28px 32px 8px;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${ROXO}">${escapeHtml(parkName)}</td></tr>
      <tr><td style="padding:0 32px 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:8px 0 20px;font-size:24px;line-height:32px;font-weight:700;color:${TINTA}">${escapeHtml(title)}</td></tr>
          ${paragrafos}
          ${quadro(rows)}
          ${listaDeLinks(links)}
          ${botao}
          ${nota}
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function passwordResetEmail(input: {
  name: string;
  parkName: string;
  url: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const primeiroNome = input.name.trim().split(/\s+/)[0] ?? input.name;
  const subject = `Redefinição de senha — ${input.parkName}`;
  const paragraphs = [
    `Olá, ${primeiroNome}.`,
    'Recebemos um pedido para redefinir a senha do seu acesso ao sistema. Para criar uma nova senha, use o botão abaixo.',
    `O link vale por ${input.expiresInMinutes} minutos e só pode ser usado uma vez.`,
  ];
  const footnote = 'Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.';
  return {
    subject,
    html: layout({
      parkName: input.parkName,
      preheader: 'Crie uma nova senha para acessar o sistema.',
      title: 'Redefinir senha',
      paragraphs,
      button: { label: 'Criar nova senha', url: input.url },
      footnote,
    }),
    text: `${paragraphs.join('\n\n')}\n\nCriar nova senha: ${input.url}\n\n${footnote}`,
  };
}

// ─── Pedidos ────────────────────────────────────────────────────────────────

function firstName(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

export interface OrderEmailInfo {
  parkName: string;
  buyerName: string;
  code: string;
  /** Data da visita por extenso. */
  visitDate: string;
  hours: string | null;
  ticketsCount: number;
  total: string;
  url: string;
  address: string | null;
}

function linhasDoPedido(input: OrderEmailInfo): { label: string; value: string }[] {
  return [
    { label: 'Pedido', value: input.code },
    { label: 'Data da visita', value: input.visitDate },
    ...(input.hours ? [{ label: 'Horário', value: input.hours }] : []),
    { label: 'Ingressos', value: String(input.ticketsCount) },
    { label: 'Total', value: input.total },
  ];
}

export function orderConfirmedEmail(input: OrderEmailInfo): RenderedEmail {
  const subject = `Ingressos confirmados — pedido ${input.code}`;
  const paragraphs = [
    `Olá, ${firstName(input.buyerName)}.`,
    'Pagamento confirmado. Seus ingressos já estão liberados: abra o pedido pelo botão abaixo e apresente o QR Code de cada ingresso na entrada do parque, no celular ou impresso.',
  ];
  const rows = [
    ...linhasDoPedido(input),
    ...(input.address ? [{ label: 'Endereço', value: input.address }] : []),
  ];
  const footnote =
    'Cada QR Code libera uma única entrada. Não encaminhe este e-mail: o link dá acesso aos seus ingressos.';
  return {
    subject,
    html: layout({
      parkName: input.parkName,
      preheader: `Pedido ${input.code} confirmado para ${input.visitDate}.`,
      title: 'Seus ingressos estão prontos',
      paragraphs,
      rows,
      button: { label: 'Ver meus ingressos', url: input.url },
      footnote,
    }),
    text: [...paragraphs, quadroEmTexto(rows), `Ver meus ingressos: ${input.url}`, footnote].join('\n\n'),
  };
}

export function orderReceivedEmail(input: OrderEmailInfo & { payUntil: string }): RenderedEmail {
  const subject = `Pedido ${input.code} recebido — falta o pagamento`;
  const paragraphs = [
    `Olá, ${firstName(input.buyerName)}.`,
    `Recebemos seu pedido. Para garantir os ingressos, pague o PIX até ${input.payUntil}. Depois disso o pedido é cancelado automaticamente e as vagas voltam a ficar disponíveis.`,
  ];
  const rows = linhasDoPedido(input);
  const footnote =
    'Se você já pagou, desconsidere este e-mail: a confirmação com os ingressos chega em instantes.';
  return {
    subject,
    html: layout({
      parkName: input.parkName,
      preheader: `Pague o PIX até ${input.payUntil} para garantir seus ingressos.`,
      title: 'Falta só o pagamento',
      paragraphs,
      rows,
      button: { label: 'Pagar com PIX', url: input.url },
      footnote,
    }),
    text: [...paragraphs, quadroEmTexto(rows), `Pagar com PIX: ${input.url}`, footnote].join('\n\n'),
  };
}

export function orderCancelledEmail(input: {
  parkName: string;
  buyerName: string;
  code: string;
  visitDate: string;
  refundedAmount: string | null;
}): RenderedEmail {
  const subject = input.refundedAmount
    ? `Reembolso do pedido ${input.code}`
    : `Pedido ${input.code} cancelado`;
  const paragraphs = [
    `Olá, ${firstName(input.buyerName)}.`,
    input.refundedAmount
      ? `O pedido ${input.code}, para ${input.visitDate}, foi cancelado e o reembolso de ${input.refundedAmount} foi feito no mesmo meio de pagamento usado na compra. O prazo para o valor aparecer depende do seu banco.`
      : `O pedido ${input.code}, para ${input.visitDate}, foi cancelado e os ingressos deixaram de valer.`,
  ];
  const footnote = 'Em caso de dúvida, fale com o atendimento do parque.';
  return {
    subject,
    html: layout({
      parkName: input.parkName,
      preheader: subject,
      title: input.refundedAmount ? 'Reembolso realizado' : 'Pedido cancelado',
      paragraphs,
      footnote,
    }),
    text: [...paragraphs, footnote].join('\n\n'),
  };
}

export function orderLinksEmail(input: {
  parkName: string;
  orders: { code: string; visitDate: string; status: string; url: string }[];
}): RenderedEmail {
  const subject = `Seus pedidos — ${input.parkName}`;
  const paragraphs = [
    'Você pediu os links dos seus pedidos. Abra cada um para ver os ingressos ou concluir o pagamento.',
  ];
  const links = input.orders.map((pedido) => ({
    label: `Pedido ${pedido.code}`,
    url: pedido.url,
    detail: `${pedido.visitDate} — ${pedido.status}`,
  }));
  const footnote =
    'Se não foi você que pediu, ignore este e-mail. Os links dão acesso somente aos pedidos feitos com este endereço.';
  return {
    subject,
    html: layout({
      parkName: input.parkName,
      preheader: 'Links para ver seus ingressos.',
      title: 'Seus pedidos',
      paragraphs,
      links,
      footnote,
    }),
    text: [
      ...paragraphs,
      links.map((link) => `${link.label} (${link.detail}): ${link.url}`).join('\n'),
      footnote,
    ].join('\n\n'),
  };
}
