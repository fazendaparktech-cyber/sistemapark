import { randomUUID } from 'node:crypto';

import type { HolderData, TicketCategory } from '@/generated/prisma/client';
import type { RoleKey } from '@/lib/access';
import { addDays, dateOnlyToDb, todayIn, weekdayOf, type DateOnly } from '@/lib/dates';
import type { CheckoutInput, HolderInput } from '@/lib/orders';
import { prisma } from '@/server/db';
import type { RequestMeta } from '@/server/request';
import type { PublicPark } from '@/server/parks/public';
import { createCart } from '@/server/sales/cart';
import { placeOnlineOrder } from '@/server/sales/checkout';

import { authAs, createPark, createUser, meta } from './factories';

const FUSO = 'America/Bahia';

export function dataFutura(dias = 10): DateOnly {
  return addDays(todayIn(FUSO), dias);
}

export function proximoSabado(minimoDeDias = 3): DateOnly {
  let data = dataFutura(minimoDeDias);
  while (weekdayOf(data) !== 6) data = addDays(data, 1);
  return data;
}

export function proximoDiaUtil(minimoDeDias = 3): DateOnly {
  let data = dataFutura(minimoDeDias);
  while (weekdayOf(data) === 0 || weekdayOf(data) === 6) data = addDays(data, 1);
  return data;
}

function digitoVerificador(digitos: readonly number[], tamanho: number): number {
  let soma = 0;
  for (let i = 0; i < tamanho; i++) soma += (digitos[i] ?? 0) * (tamanho + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

let sequenciaDeCpf = 123_456_000;

/** CPF válido e diferente a cada chamada. */
export function novoCpf(): string {
  sequenciaDeCpf += 1013;
  const base = String(sequenciaDeCpf).slice(-9).split('').map(Number);
  const primeiro = digitoVerificador(base, 9);
  const segundo = digitoVerificador([...base, primeiro], 10);
  return `${base.join('')}${primeiro}${segundo}`;
}

export async function criarParqueDeVendas(papeis: RoleKey[] = ['SUPER_ADMIN']) {
  const parque = await createPark();
  const pessoa = await createUser({ parkId: parque.id, roles: papeis });
  const { auth } = await authAs(pessoa, parque.id);
  const publico: PublicPark = {
    id: parque.id,
    slug: parque.slug,
    name: parque.name,
    timezone: parque.timezone,
    orderCodePrefix: parque.orderCodePrefix,
    email: null,
    phone: null,
    whatsapp: null,
    addressLine: null,
    city: null,
    state: null,
    postalCode: null,
  };
  return { parque, auth, publico };
}

export async function abrirDia(parkId: string, date: DateOnly, capacity = 100) {
  return prisma.parkDay.create({
    data: { parkId, date: dateOnlyToDb(date), status: 'OPEN', opensAt: '09:00', closesAt: '17:00', capacity },
  });
}

export async function criarTipo(
  parkId: string,
  dados: {
    name?: string;
    category?: TicketCategory;
    basePriceCents?: number;
    holderData?: HolderData;
    minAge?: number | null;
    maxAge?: number | null;
    maxPerCustomerPerDay?: number | null;
    dailyQuota?: number | null;
    peoplePerTicket?: number;
    occupiesCapacity?: boolean;
  } = {},
) {
  return prisma.ticketType.create({
    data: {
      parkId,
      slug: `tipo-${randomUUID().slice(0, 8)}`,
      name: dados.name ?? 'Adulto',
      category: dados.category ?? 'ADULT',
      basePriceCents: dados.basePriceCents ?? 7000,
      holderData: dados.holderData ?? 'NONE',
      minAge: dados.minAge ?? null,
      maxAge: dados.maxAge ?? null,
      maxPerCustomerPerDay: dados.maxPerCustomerPerDay ?? null,
      dailyQuota: dados.dailyQuota ?? null,
      peoplePerTicket: dados.peoplePerTicket ?? 1,
      occupiesCapacity: dados.occupiesCapacity ?? true,
      channels: ['ONLINE', 'POS'],
    },
  });
}

export function comprador(sobrescrever: Partial<CheckoutInput['buyer']> = {}): CheckoutInput['buyer'] {
  return {
    name: 'Maria da Silva Santos',
    email: `maria-${randomUUID().slice(0, 8)}@teste.dev`,
    phone: '(73) 99999-8888',
    cpf: novoCpf(),
    birthDate: '1990-05-20',
    city: 'Ubatã',
    state: 'BA',
    ...sobrescrever,
  };
}

export async function comprar(
  publico: PublicPark,
  date: DateOnly,
  itens: { ticketTypeId: string; quantity: number }[],
  opcoes: {
    buyer?: CheckoutInput['buyer'];
    holders?: HolderInput[];
    couponCode?: string | null;
    idempotencyKey?: string;
    meta?: RequestMeta;
  } = {},
) {
  const metadados = opcoes.meta ?? meta();
  const { token } = await createCart({
    park: publico,
    selection: { date, items: itens },
    previousToken: null,
    meta: metadados,
  });
  const resultado = await placeOnlineOrder({
    park: publico,
    cartToken: token,
    data: {
      buyer: opcoes.buyer ?? comprador(),
      holders: opcoes.holders ?? [],
      couponCode: opcoes.couponCode ?? null,
      marketingOptIn: false,
      acceptTerms: true,
      idempotencyKey: opcoes.idempotencyKey ?? randomUUID(),
    },
    meta: metadados,
  });
  return { cartToken: token, ...resultado };
}
