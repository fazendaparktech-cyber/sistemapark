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
  button?: { label: string; url: string };
  footnote?: string;
}

function layout({ parkName, preheader, title, paragraphs, button, footnote }: Layout): string {
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
