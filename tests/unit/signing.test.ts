import { describe, expect, it } from 'vitest';

import {
  base32Crockford,
  hashCpf,
  isOrderAccessTokenValid,
  isTicketQrSignatureValid,
  orderAccessToken,
  parseTicketQr,
  ticketQrPayload,
} from '@/server/signing';

const INGRESSO = { parkId: '01a09bc3-1297-72ee-855c-252a62962dd5', code: '7K9Q2MXA3B', qrVersion: 1 };

describe('QR Code do ingresso', () => {
  it('só tem letras, números e ponto, sem dado pessoal, e a assinatura confere', () => {
    const conteudo = ticketQrPayload(INGRESSO);
    expect(conteudo).toMatch(/^CP1\.7K9Q2MXA3B\.[0-9A-HJKMNP-TV-Z]{26}$/);
    const lido = parseTicketQr(conteudo);
    expect(lido?.code).toBe('7K9Q2MXA3B');
    expect(lido && isTicketQrSignatureValid(INGRESSO, lido.signature)).toBe(true);
  });

  it('não confere se o QR foi reemitido, é de outro parque ou teve o código trocado', () => {
    const lido = parseTicketQr(ticketQrPayload(INGRESSO));
    expect(lido).not.toBeNull();
    const assinatura = lido?.signature ?? '';
    expect(isTicketQrSignatureValid({ ...INGRESSO, qrVersion: 2 }, assinatura)).toBe(false);
    expect(
      isTicketQrSignatureValid({ ...INGRESSO, parkId: '01a09bc3-0000-72ee-855c-252a62962dd5' }, assinatura),
    ).toBe(false);
    expect(isTicketQrSignatureValid({ ...INGRESSO, code: '7K9Q2MXA3C' }, assinatura)).toBe(false);
  });

  it('recusa conteúdo que não é QR do sistema e aceita leitura com espaços e minúsculas', () => {
    expect(parseTicketQr('https://exemplo.com.br')).toBeNull();
    expect(parseTicketQr('CP1.ABC.DEF')).toBeNull();
    const conteudo = ticketQrPayload(INGRESSO);
    expect(parseTicketQr(`  ${conteudo.toLowerCase()} `)?.code).toBe('7K9Q2MXA3B');
  });
});

describe('link do pedido', () => {
  const PEDIDO = { id: '01a09bc3-12aa-77c9-9a50-e1cbfc3b606f', accessVersion: 1 };

  it('vale para o pedido e a versão de acesso atuais', () => {
    const token = orderAccessToken(PEDIDO);
    expect(token).toHaveLength(32);
    expect(isOrderAccessTokenValid(PEDIDO, token)).toBe(true);
  });

  it('deixa de valer quando a versão muda ou o token é alterado', () => {
    const token = orderAccessToken(PEDIDO);
    expect(isOrderAccessTokenValid({ ...PEDIDO, accessVersion: 2 }, token)).toBe(false);
    expect(isOrderAccessTokenValid(PEDIDO, `${token.slice(0, 31)}${token.endsWith('A') ? 'B' : 'A'}`)).toBe(
      false,
    );
    expect(isOrderAccessTokenValid(PEDIDO, undefined)).toBe(false);
    expect(isOrderAccessTokenValid(PEDIDO, '')).toBe(false);
  });
});

describe('hash de CPF e base32', () => {
  it('é estável, não contém o número e muda com o CPF', () => {
    const hash = hashCpf('52998224725');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCpf('52998224725')).toBe(hash);
    expect(hash).not.toContain('52998224725');
    expect(hashCpf('11144477735')).not.toBe(hash);
  });

  it('codifica em Crockford Base32', () => {
    expect(base32Crockford(new Uint8Array([0]))).toBe('00');
    expect(base32Crockford(new Uint8Array([255]))).toBe('ZW');
  });
});
