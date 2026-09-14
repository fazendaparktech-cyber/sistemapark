import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { HolderData } from '@/generated/prisma/client';
import { addDays, dateOnlyToDb, todayIn } from '@/lib/dates';
import type { PosSaleInput } from '@/lib/orders';
import {
  checkInByQr,
  checkInManually,
  getCheckinSummary,
  searchCheckinTickets,
} from '@/server/checkin/service';
import { prisma } from '@/server/db';
import { listNotifications, markNotificationsRead } from '@/server/notifications/service';
import { placePosOrder } from '@/server/sales/pos';
import { ticketQrPayload } from '@/server/signing';
import { getTicketAdmin, listTickets } from '@/server/tickets/service';

import { authAs, createUser, expectAppError, meta } from '../helpers/factories';
import { abrirDia, criarParqueDeVendas, criarTipo, novoCpf } from '../helpers/sales';

const FUSO = 'America/Bahia';

async function ingressosVendidos(
  opcoes: {
    dias?: number;
    quantidade?: number;
    holderData?: HolderData;
    venda?: (ticketTypeId: string) => Partial<PosSaleInput>;
  } = {},
) {
  const { parque, publico, auth } = await criarParqueDeVendas();
  const hoje = todayIn(FUSO);
  const data = addDays(hoje, opcoes.dias ?? 0);
  await abrirDia(publico.id, data, 100);
  const tipo = await criarTipo(publico.id, { holderData: opcoes.holderData ?? 'NONE' });
  const venda = await placePosOrder(
    auth,
    {
      visitDate: data,
      items: [{ ticketTypeId: tipo.id, quantity: opcoes.quantidade ?? 2 }],
      buyer: { name: 'Marcos Portaria Lima', phone: '(73) 98765-4321' },
      paymentMethod: 'CASH',
      idempotencyKey: randomUUID(),
      ...opcoes.venda?.(tipo.id),
    },
    meta(),
  );
  const ingressos = await prisma.ticket.findMany({
    where: { orderId: venda.orderId },
    orderBy: { code: 'asc' },
  });
  const [primeiro, segundo] = ingressos;
  if (!primeiro) throw new Error('Venda sem ingressos.');
  return { parque, auth, venda, ingressos, primeiro, segundo, hoje };
}

describe('portaria', () => {
  it('QR válido libera uma vez; a segunda leitura é negada e avisa a gestão', async () => {
    const { parque, auth, primeiro } = await ingressosVendidos();
    const payload = ticketQrPayload(primeiro);

    const liberada = await checkInByQr(auth, { payload, device: 'Celular da portaria' }, meta());
    expect(liberada).toMatchObject({ allowed: true, reason: null, title: 'Entrada liberada' });
    expect(liberada.ticket).toMatchObject({ code: primeiro.code, buyerName: 'Marcos Portaria Lima' });

    const repetida = await checkInByQr(auth, { payload }, meta());
    expect(repetida).toMatchObject({
      allowed: false,
      reason: 'ALREADY_USED',
      title: 'Ingresso já utilizado',
    });
    expect(repetida.detail).toMatch(/^Entrada registrada hoje às \d{2}:\d{2}/);

    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: primeiro.id } })).toMatchObject({
      status: 'CHECKED_IN',
      checkedInById: auth.user.id,
    });
    expect(await prisma.checkinAttempt.count({ where: { ticketId: primeiro.id } })).toBe(2);

    await checkInByQr(auth, { payload }, meta());
    expect(await prisma.notification.count({ where: { parkId: parque.id, type: 'DUPLICATE_CHECKIN' } })).toBe(
      1,
    );

    const avisos = await listNotifications(auth);
    expect(avisos.unread).toBe(1);
    expect(avisos.items[0]).toMatchObject({ type: 'DUPLICATE_CHECKIN', read: false });
    expect(await markNotificationsRead(auth, { all: true })).toEqual({ unread: 0 });
    expect((await listNotifications(auth)).items[0]?.read).toBe(true);
  });

  it('leituras simultâneas do mesmo QR liberam uma entrada só', async () => {
    const { auth, primeiro } = await ingressosVendidos();
    const payload = ticketQrPayload(primeiro);
    const resultados = await Promise.all(
      Array.from({ length: 6 }, () => checkInByQr(auth, { payload }, meta())),
    );
    expect(resultados.filter((resultado) => resultado.allowed)).toHaveLength(1);
    expect(resultados.filter((resultado) => resultado.reason === 'ALREADY_USED')).toHaveLength(5);
  });

  it('QR adulterado, ingresso de outro parque e texto qualquer são negados e registrados', async () => {
    const { parque, auth, primeiro } = await ingressosVendidos();
    const payload = ticketQrPayload(primeiro);
    const adulterado = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
    const outro = await ingressosVendidos();

    expect((await checkInByQr(auth, { payload: adulterado }, meta())).reason).toBe('INVALID_QR');
    expect((await checkInByQr(auth, { payload: ticketQrPayload(outro.primeiro) }, meta())).reason).toBe(
      'NOT_FOUND',
    );
    expect((await checkInByQr(auth, { payload: 'https://exemplo.com/qualquer' }, meta())).reason).toBe(
      'INVALID_QR',
    );
    expect(await prisma.checkinAttempt.count({ where: { parkId: parque.id, result: 'DENIED' } })).toBe(3);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: primeiro.id } })).status).toBe('ACTIVE');
  });

  it('nega ingresso de outra data, com pagamento pendente, cancelado, reembolsado e de data passada', async () => {
    const futuro = await ingressosVendidos({ dias: 3 });
    const outraData = await checkInByQr(futuro.auth, { payload: ticketQrPayload(futuro.primeiro) }, meta());
    expect(outraData).toMatchObject({ allowed: false, reason: 'WRONG_DATE' });
    expect(outraData.detail).toContain('Este ingresso é para');

    const pix = await ingressosVendidos({ venda: () => ({ paymentMethod: 'PIX' }) });
    expect((await checkInByQr(pix.auth, { payload: ticketQrPayload(pix.primeiro) }, meta())).reason).toBe(
      'PENDING_PAYMENT',
    );

    const mexidos = await ingressosVendidos();
    if (!mexidos.segundo) throw new Error('Venda com um ingresso só.');
    await prisma.ticket.update({ where: { id: mexidos.primeiro.id }, data: { status: 'CANCELLED' } });
    await prisma.ticket.update({ where: { id: mexidos.segundo.id }, data: { status: 'REFUNDED' } });
    expect(
      (await checkInByQr(mexidos.auth, { payload: ticketQrPayload(mexidos.primeiro) }, meta())).reason,
    ).toBe('CANCELLED');
    expect(
      (await checkInByQr(mexidos.auth, { payload: ticketQrPayload(mexidos.segundo) }, meta())).reason,
    ).toBe('REFUNDED');

    const antigo = await ingressosVendidos({ quantidade: 1 });
    await prisma.ticket.update({
      where: { id: antigo.primeiro.id },
      data: { visitDate: dateOnlyToDb(addDays(antigo.hoje, -1)) },
    });
    expect(
      (await checkInByQr(antigo.auth, { payload: ticketQrPayload(antigo.primeiro) }, meta())).reason,
    ).toBe('EXPIRED');
  });

  it('busca por nome, CPF, celular, código do ingresso e pedido, e libera pela busca', async () => {
    const cpf = novoCpf();
    const vendidos = await ingressosVendidos({
      quantidade: 1,
      holderData: 'NAME_CPF',
      venda: (ticketTypeId) => ({ holders: [{ ticketTypeId, name: 'Helena Visitante Rocha', cpf }] }),
    });
    const { auth, primeiro, venda } = vendidos;

    for (const termo of [
      'helena visitante',
      cpf,
      '(73) 98765-4321',
      primeiro.code,
      venda.code,
      venda.code.slice(-3),
    ]) {
      const achados = await searchCheckinTickets(auth, termo);
      expect(
        achados.map((achado) => achado.id),
        `busca por ${termo}`,
      ).toContain(primeiro.id);
    }
    expect(await searchCheckinTickets(auth, 'ab')).toEqual([]);

    const liberada = await checkInManually(auth, { ticketId: primeiro.id }, meta());
    expect(liberada).toMatchObject({ allowed: true });
    expect(liberada.ticket?.holderName).toBe('Helena Visitante Rocha');
    expect(await prisma.checkinAttempt.findFirstOrThrow({ where: { ticketId: primeiro.id } })).toMatchObject({
      method: 'MANUAL',
      result: 'ALLOWED',
    });
  });

  it('portaria libera e acompanha o dia; bilheteria não libera entrada', async () => {
    const { parque, primeiro, segundo } = await ingressosVendidos({ quantidade: 3 });
    if (!segundo) throw new Error('Venda com um ingresso só.');
    const porteiro = await createUser({ parkId: parque.id, roles: ['GATE'], name: 'Bruno Portaria' });
    const { auth: authPortaria } = await authAs(porteiro, parque.id);

    expect((await checkInByQr(authPortaria, { payload: ticketQrPayload(primeiro) }, meta())).allowed).toBe(
      true,
    );
    const resumo = await getCheckinSummary(authPortaria);
    expect(resumo).toMatchObject({ expected: 3, checkedIn: 1, remaining: 2, capacity: 100, deniedToday: 0 });
    expect(resumo.recent[0]).toMatchObject({
      allowed: true,
      operatorName: 'Bruno Portaria',
      code: primeiro.code,
    });
    await expectAppError(listTickets(authPortaria), 'FORBIDDEN');

    const bilheteria = await createUser({ parkId: parque.id, roles: ['BOX_OFFICE'] });
    const { auth: authBilheteria } = await authAs(bilheteria, parque.id);
    await expectAppError(
      checkInByQr(authBilheteria, { payload: ticketQrPayload(segundo) }, meta()),
      'FORBIDDEN',
    );
    await expectAppError(checkInManually(authBilheteria, { ticketId: segundo.id }, meta()), 'FORBIDDEN');
  });
});

describe('ingressos no painel', () => {
  it('lista pela situação do dia e mostra QR, histórico e tentativas na ficha', async () => {
    const { auth, primeiro, segundo, hoje } = await ingressosVendidos();
    if (!segundo) throw new Error('Venda com um ingresso só.');
    await checkInByQr(auth, { payload: ticketQrPayload(primeiro) }, meta());
    await checkInByQr(auth, { payload: ticketQrPayload(primeiro) }, meta());

    expect((await listTickets(auth, { status: 'CHECKED_IN' })).items.map((item) => item.id)).toEqual([
      primeiro.id,
    ]);
    expect((await listTickets(auth, { status: 'ACTIVE' })).items.map((item) => item.id)).toEqual([
      segundo.id,
    ]);

    const usado = await getTicketAdmin(auth, primeiro.id);
    expect(usado.qrSvg).toBeNull();
    expect(usado.attempts.map((tentativa) => tentativa.allowed)).toEqual([false, true]);
    expect(usado.events.map((evento) => evento.type)).toContain('CHECKED_IN');
    expect((await getTicketAdmin(auth, segundo.id)).qrSvg).toContain('<svg');

    await prisma.ticket.update({
      where: { id: segundo.id },
      data: { visitDate: dateOnlyToDb(addDays(hoje, -2)) },
    });
    const expirados = await listTickets(auth, { status: 'EXPIRED' });
    expect(expirados.items.map((item) => item.id)).toEqual([segundo.id]);
    expect(expirados.items[0]?.status).toBe('EXPIRED');
  });
});
