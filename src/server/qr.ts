import 'server-only';

import QRCode from 'qrcode';

/** QR Code em SVG com as cores do sistema (tinta escura sobre branco). */
export function qrCodeSvg(conteudo: string): Promise<string> {
  return QRCode.toString(conteudo, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#1E1A2EFF', light: '#FFFFFFFF' },
  });
}
