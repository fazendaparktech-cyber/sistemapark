/**
 * Dados de vendas fictícios para desenvolvimento: ingressos, preços, calendário,
 * clientes, cupons e cerca de dois meses de pedidos, pagamentos e entradas na
 * portaria. Chamado por prisma/seed.ts, que só roda em banco local.
 *
 * Só cria dados quando o parque ainda não tem tipos de ingresso: nunca altera
 * nem apaga o que já existe. Valores sorteados com semente fixa (reproduzível).
 */
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { addDays, dateOnlyToDb, todayIn, weekdayOf, zonedTimeToInstant, type DateOnly } from '@/lib/dates';
import { maskCpf } from '@/lib/documents';
import { allocateCents, applyBps } from '@/lib/money';
import { formatOrderCode } from '@/lib/orders';
import { resolvePrice, type DayKind, type PriceRule } from '@/lib/pricing';
import { slugify } from '@/lib/slug';
import { randomCrockford } from '@/server/crypto';
import { mockPixPayload } from '@/server/payments/mock';
import { hashCpf } from '@/server/signing';

// ─── Sorteio reproduzível ───────────────────────────────────────────────────

function gerador(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sorteio = gerador(20260913);

function inteiro(min: number, max: number): number {
  return min + Math.floor(sorteio() * (max - min + 1));
}

function chance(probabilidade: number): boolean {
  return sorteio() < probabilidade;
}

function escolher<T>(lista: readonly T[]): T {
  const item = lista[Math.floor(sorteio() * lista.length)];
  if (item === undefined) throw new Error('Lista vazia no seed.');
  return item;
}

function uuidv7(instante: number): string {
  const bytes = new Uint8Array(16);
  let tempo = instante;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = tempo % 256;
    tempo = Math.floor(tempo / 256);
  }
  for (let i = 6; i < 16; i++) bytes[i] = Math.floor(sorteio() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function digitoVerificador(digitos: readonly number[], tamanho: number): number {
  let soma = 0;
  for (let i = 0; i < tamanho; i++) soma += (digitos[i] ?? 0) * (tamanho + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function cpfFicticio(): string {
  const base = Array.from({ length: 9 }, () => inteiro(0, 9));
  if (base.every((digito) => digito === base[0])) base[8] = ((base[8] ?? 0) + 1) % 10;
  const primeiro = digitoVerificador(base, 9);
  const segundo = digitoVerificador([...base, primeiro], 10);
  return `${base.join('')}${primeiro}${segundo}`;
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

const NOMES = [
  'Ana',
  'Beatriz',
  'Bruno',
  'Camila',
  'Carlos',
  'Daniela',
  'Diego',
  'Eduarda',
  'Felipe',
  'Fernanda',
  'Gabriel',
  'Gabriela',
  'Gustavo',
  'Helena',
  'Igor',
  'Isabela',
  'João',
  'Juliana',
  'Larissa',
  'Leonardo',
  'Letícia',
  'Lucas',
  'Luana',
  'Marcelo',
  'Mariana',
  'Mateus',
  'Natália',
  'Paulo',
  'Patrícia',
  'Rafael',
  'Renata',
  'Rodrigo',
  'Sabrina',
  'Tiago',
  'Vanessa',
  'Vinícius',
  'Yasmin',
  'Caio',
  'Priscila',
  'Alan',
];
const NOMES_INFANTIS = [
  'Alice',
  'Miguel',
  'Laura',
  'Arthur',
  'Sofia',
  'Heitor',
  'Manuela',
  'Davi',
  'Valentina',
  'Bernardo',
  'Lívia',
  'Theo',
];
const SOBRENOMES = [
  'Silva',
  'Santos',
  'Oliveira',
  'Souza',
  'Lima',
  'Pereira',
  'Costa',
  'Rodrigues',
  'Almeida',
  'Nascimento',
  'Carvalho',
  'Araújo',
  'Ribeiro',
  'Barbosa',
  'Cardoso',
  'Rocha',
  'Dias',
  'Teixeira',
  'Moura',
  'Freitas',
  'Brito',
  'Macedo',
  'Queiroz',
  'Andrade',
  'Menezes',
];
const DDDS = ['73', '73', '73', '71', '77', '75'];
const ORIGENS = [
  null,
  null,
  null,
  'instagram',
  'instagram',
  'instagram',
  'whatsapp',
  'whatsapp',
  'google',
  'facebook',
];

const FERIADOS: Record<DateOnly, string> = {
  '2026-09-07': 'Independência do Brasil',
  '2026-10-12': 'Dia das Crianças',
  '2026-11-02': 'Finados',
  '2026-11-15': 'Proclamação da República',
  '2026-11-20': 'Consciência Negra',
  '2026-12-25': 'Natal',
};

interface TipoCriado {
  id: string;
  name: string;
  basePriceCents: number;
  holderData: 'NONE' | 'NAME' | 'NAME_BIRTHDATE' | 'NAME_CPF' | 'NAME_CPF_BIRTHDATE';
  peoplePerTicket: number;
  occupiesCapacity: boolean;
  regras: PriceRule[];
  idadeInfantil: [number, number] | null;
}

interface ClienteCriado {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  createdAt: Date;
}

interface DiaCriado {
  id: string;
  date: DateOnly;
  opensAt: string;
  closesAt: string;
  capacity: number;
  dayKind: DayKind | null;
}

interface Equipe {
  admin: string | null;
  bilheteria: string | null;
  portaria: string | null;
}

async function emLotes<T>(
  itens: T[],
  tamanho: number,
  gravar: (lote: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < itens.length; i += tamanho) await gravar(itens.slice(i, i + tamanho));
}

export async function seedVendas(
  db: PrismaClient,
  parque: { id: string; timezone: string; orderCodePrefix: string },
  equipe: Equipe,
): Promise<string> {
  if ((await db.ticketType.count({ where: { parkId: parque.id } })) > 0) {
    return 'Vendas: o parque já tem ingressos cadastrados; nada foi criado.';
  }

  const fuso = parque.timezone;
  const agora = new Date();
  const hoje = todayIn(fuso, agora);
  const criadoEm = (data: DateOnly, hora: number, minuto = 0) =>
    zonedTimeToInstant(data, `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`, fuso);

  await db.park.update({
    where: { id: parque.id },
    data: {
      addressLine: 'Rodovia BA-650, km 4, zona rural (endereço fictício)',
      postalCode: '45550000',
      phone: '557332210000',
    },
  });

  // Tipos de ingresso e regras de preço (preços do site antigo do parque).
  const definicoes = [
    {
      slug: 'adulto',
      name: 'Adulto',
      description: 'A partir de 12 anos.',
      category: 'ADULT' as const,
      basePriceCents: 7000,
      minAge: 12,
      maxAge: null,
      holderData: 'NAME' as const,
      precos: [
        { name: 'Fim de semana e feriado', priceCents: 8000, dayKinds: ['WEEKEND', 'HOLIDAY'] as DayKind[] },
      ],
    },
    {
      slug: 'infantil',
      name: 'Infantil',
      description: 'De 3 a 11 anos. Criança acompanhada de um adulto.',
      category: 'CHILD' as const,
      basePriceCents: 4500,
      minAge: 3,
      maxAge: 11,
      holderData: 'NAME_BIRTHDATE' as const,
      precos: [
        { name: 'Fim de semana e feriado', priceCents: 5000, dayKinds: ['WEEKEND', 'HOLIDAY'] as DayKind[] },
      ],
    },
    {
      slug: 'meia-entrada',
      name: 'Meia-entrada',
      description: 'Estudantes, pessoas com deficiência e idosos, com documento.',
      category: 'HALF' as const,
      basePriceCents: 3500,
      minAge: null,
      maxAge: null,
      holderData: 'NAME' as const,
      requiresDocument: true,
      documentHint: 'Carteira de estudante, ID Jovem, documento de idoso ou laudo',
      precos: [
        { name: 'Fim de semana e feriado', priceCents: 4000, dayKinds: ['WEEKEND', 'HOLIDAY'] as DayKind[] },
      ],
    },
    {
      slug: 'crianca-de-colo',
      name: 'Criança de colo',
      description: 'Até 2 anos, no colo de um adulto. Gratuito.',
      category: 'CHILD' as const,
      basePriceCents: 0,
      minAge: 0,
      maxAge: 2,
      holderData: 'NAME_BIRTHDATE' as const,
      occupiesCapacity: false,
      maxPerOrder: 4,
      precos: [],
    },
    {
      slug: 'combo-familia',
      name: 'Combo Família',
      description: 'Quatro pessoas: dois adultos e duas crianças de até 11 anos.',
      category: 'FAMILY' as const,
      basePriceCents: 22000,
      minAge: null,
      maxAge: null,
      holderData: 'NAME' as const,
      peoplePerTicket: 4,
      channels: ['ONLINE'] as const,
      maxPerOrder: 2,
      precos: [
        {
          name: 'Lote promocional',
          priceCents: 19900,
          compareAtCents: 22000,
          dayKinds: [] as DayKind[],
          lotQuantity: 60,
          priority: 10,
        },
      ],
    },
  ];

  const tipos: TipoCriado[] = [];
  for (const [indice, definicao] of definicoes.entries()) {
    const criado = await db.ticketType.create({
      data: {
        parkId: parque.id,
        slug: definicao.slug,
        name: definicao.name,
        description: definicao.description,
        category: definicao.category,
        basePriceCents: definicao.basePriceCents,
        minAge: definicao.minAge,
        maxAge: definicao.maxAge,
        holderData: definicao.holderData,
        requiresDocument: 'requiresDocument' in definicao ? definicao.requiresDocument : false,
        documentHint: 'documentHint' in definicao ? definicao.documentHint : null,
        occupiesCapacity: 'occupiesCapacity' in definicao ? definicao.occupiesCapacity : true,
        peoplePerTicket: 'peoplePerTicket' in definicao ? definicao.peoplePerTicket : 1,
        maxPerOrder: 'maxPerOrder' in definicao ? definicao.maxPerOrder : null,
        channels: 'channels' in definicao && definicao.channels ? [...definicao.channels] : ['ONLINE', 'POS'],
        sortOrder: indice + 1,
        rulesText:
          definicao.category === 'HALF'
            ? 'Apresente na entrada o documento que comprova o direito à meia-entrada.'
            : null,
        createdAt: criadoEm(addDays(hoje, -90), 10),
        prices: {
          create: definicao.precos.map((preco) => ({
            name: preco.name,
            priceCents: preco.priceCents,
            compareAtCents: 'compareAtCents' in preco ? preco.compareAtCents : null,
            dayKinds: preco.dayKinds,
            lotQuantity: 'lotQuantity' in preco ? preco.lotQuantity : null,
            priority: 'priority' in preco ? preco.priority : 0,
            createdAt: criadoEm(addDays(hoje, -90), 10),
          })),
        },
      },
      include: { prices: true },
    });
    tipos.push({
      id: criado.id,
      name: criado.name,
      basePriceCents: criado.basePriceCents,
      holderData: criado.holderData,
      peoplePerTicket: criado.peoplePerTicket,
      occupiesCapacity: criado.occupiesCapacity,
      idadeInfantil: criado.maxAge !== null ? [criado.minAge ?? 0, criado.maxAge] : null,
      regras: criado.prices.map((preco) => ({
        id: preco.id,
        name: preco.name,
        priceCents: preco.priceCents,
        compareAtCents: preco.compareAtCents,
        dayKinds: preco.dayKinds,
        visitFrom: null,
        visitUntil: null,
        saleStartsAt: null,
        saleEndsAt: null,
        lotQuantity: preco.lotQuantity,
        priority: preco.priority,
        isActive: preco.isActive,
        createdAt: preco.createdAt,
      })),
    });
  }
  const [adulto, infantil, meia, colo, combo] = tipos;
  if (!adulto || !infantil || !meia || !colo || !combo)
    throw new Error('Tipos de ingresso do seed incompletos.');

  // Calendário: quinta a domingo e feriados abertos; segunda a quarta fechados.
  const dias = new Map<DateOnly, DiaCriado>();
  const linhasDoCalendario: Prisma.ParkDayCreateManyInput[] = [];
  for (let deslocamento = -75; deslocamento <= 120; deslocamento++) {
    const data = addDays(hoje, deslocamento);
    const semana = weekdayOf(data);
    const feriado = FERIADOS[data];
    const aberto = Boolean(feriado) || semana === 0 || semana >= 4;
    const fimDeSemana = semana === 0 || semana === 6;
    const id = uuidv7(criadoEm(data, 0).getTime());
    const linha: DiaCriado = {
      id,
      date: data,
      opensAt: '09:00',
      closesAt: fimDeSemana || feriado ? '17:30' : '17:00',
      capacity: fimDeSemana || feriado ? 1500 : 1000,
      dayKind: feriado ? 'HOLIDAY' : null,
    };
    linhasDoCalendario.push({
      id,
      parkId: parque.id,
      date: dateOnlyToDb(data),
      status: aberto ? 'OPEN' : 'CLOSED',
      opensAt: aberto ? linha.opensAt : null,
      closesAt: aberto ? linha.closesAt : null,
      capacity: linha.capacity,
      dayKind: linha.dayKind,
      label: feriado ?? null,
    });
    if (aberto) dias.set(data, linha);
  }
  await db.parkDay.createMany({ data: linhasDoCalendario });

  // Cupons.
  const cupomVerao = await db.coupon.create({
    data: {
      parkId: parque.id,
      code: 'VERAO10',
      description: 'Campanha de fim de inverno no Instagram',
      discountType: 'PERCENT',
      percentBps: 1000,
      maxUses: 400,
      channels: ['ONLINE'],
      createdById: equipe.admin,
      createdAt: criadoEm(addDays(hoje, -70), 9),
    },
  });
  const cupomFamilia = await db.coupon.create({
    data: {
      parkId: parque.id,
      code: 'FAMILIA20',
      description: 'R$ 20 de desconto em compras a partir de R$ 150',
      discountType: 'FIXED',
      amountCents: 2000,
      minOrderCents: 15000,
      maxUsesPerCustomer: 2,
      channels: ['ONLINE', 'POS'],
      createdById: equipe.admin,
      createdAt: criadoEm(addDays(hoje, -50), 9),
    },
  });
  await db.coupon.create({
    data: {
      parkId: parque.id,
      code: 'CRIANCAS15',
      description: 'Semana das Crianças: 15% nos ingressos infantis',
      discountType: 'PERCENT',
      percentBps: 1500,
      startsAt: criadoEm(addDays(hoje, 14), 0),
      endsAt: criadoEm(addDays(hoje, 30), 0),
      visitFrom: dateOnlyToDb(addDays(hoje, 14)),
      visitUntil: dateOnlyToDb(addDays(hoje, 35)),
      channels: ['ONLINE'],
      createdById: equipe.admin,
      ticketTypes: { create: [{ ticketTypeId: infantil.id }] },
    },
  });
  await db.coupon.create({
    data: {
      parkId: parque.id,
      code: 'PARCEIRO5',
      description: 'Parceria com hotel da região (encerrada)',
      discountType: 'PERCENT',
      percentBps: 500,
      isActive: false,
      channels: ['ONLINE', 'POS'],
      createdById: equipe.admin,
      createdAt: criadoEm(addDays(hoje, -85), 9),
    },
  });

  // Clientes.
  const clientes: ClienteCriado[] = [];
  const emails = new Set<string>();
  for (let i = 0; i < 180; i++) {
    const nome = `${escolher(NOMES)} ${escolher(SOBRENOMES)} ${escolher(SOBRENOMES)}`;
    let email = `${slugify(nome).replace(/-/g, '.')}@example.com`;
    for (let n = 2; emails.has(email); n++) email = `${slugify(nome).replace(/-/g, '.')}${n}@example.com`;
    emails.add(email);
    const instante = criadoEm(addDays(hoje, -inteiro(0, 88)), inteiro(8, 22), inteiro(0, 59));
    clientes.push({
      id: uuidv7(instante.getTime()),
      name: nome,
      email,
      phone: `55${escolher(DDDS)}9${inteiro(8, 9)}${String(inteiro(0, 9_999_999)).padStart(7, '0')}`,
      cpf: cpfFicticio(),
      createdAt: instante,
    });
  }
  await db.customer.createMany({
    data: clientes.map((cliente) => ({
      id: cliente.id,
      parkId: parque.id,
      name: cliente.name,
      email: cliente.email,
      phone: cliente.phone,
      cpfHash: hashCpf(cliente.cpf),
      cpfMasked: maskCpf(cliente.cpf),
      marketingOptIn: chance(0.46),
      createdAt: cliente.createdAt,
    })),
    skipDuplicates: true,
  });

  // Pedidos.
  interface Planejado {
    id: string;
    createdAt: Date;
    dia: DiaCriado;
    cliente: ClienteCriado;
    canal: 'ONLINE' | 'POS';
    itens: {
      tipo: TipoCriado;
      quantidade: number;
      unitario: number;
      regraId: string | null;
      rotulo: string | null;
    }[];
    cupom: { id: string; code: string } | null;
    desconto: number;
    situacao: 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED' | 'PENDING';
    metodo: 'PIX' | 'CASH' | 'CARD_TERMINAL';
    origem: string | null;
  }

  const planejados: Planejado[] = [];
  const vendidosPorLote = new Map<string, number>();
  const usosPorCpf = new Map<string, number>();
  const recorrentes = clientes.slice(0, 40);

  for (let deslocamento = -60; deslocamento <= 45; deslocamento++) {
    const data = addDays(hoje, deslocamento);
    const dia = dias.get(data);
    if (!dia) continue;
    const semana = weekdayOf(data);
    const forte = dia.dayKind === 'HOLIDAY' || semana === 0 || semana === 6;
    let quantidade: number;
    if (deslocamento <= 0) quantidade = forte ? inteiro(20, 34) : inteiro(7, 14);
    else if (deslocamento <= 10) quantidade = forte ? inteiro(9, 16) : inteiro(2, 6);
    else if (deslocamento <= 30) quantidade = forte ? inteiro(3, 8) : inteiro(0, 3);
    else quantidade = forte ? inteiro(0, 4) : inteiro(0, 1);
    if (dia.dayKind === 'HOLIDAY') quantidade = Math.round(quantidade * 1.4);

    for (let n = 0; n < quantidade; n++) {
      const canal: 'ONLINE' | 'POS' = deslocamento <= 0 && chance(0.18) ? 'POS' : 'ONLINE';
      const antecedencia = canal === 'POS' ? 0 : Math.min(inteiro(0, 12), deslocamento <= 0 ? 12 : 60);
      const diaDaCompra = addDays(data, -antecedencia);
      const hora =
        canal === 'POS' ? inteiro(9, 13) : escolher([8, 10, 12, 13, 18, 19, 19, 20, 20, 21, 21, 22, 15, 16]);
      let instante = criadoEm(diaDaCompra, hora, inteiro(0, 59));
      // Compra para visita futura: espalhada pelos dias anteriores, sem acumular tudo no dia de hoje.
      if (instante > agora) instante = criadoEm(addDays(hoje, -inteiro(1, 14)), hora, inteiro(0, 59));
      if (diaDaCompra < addDays(hoje, -62)) continue;

      const cliente = chance(0.3) ? escolher(recorrentes) : escolher(clientes);
      const itens: Planejado['itens'] = [];
      const adicionar = (tipo: TipoCriado, qtd: number) => {
        if (qtd <= 0) return;
        const vendidos = new Map([...vendidosPorLote]);
        const preco = resolvePrice({
          basePriceCents: tipo.basePriceCents,
          rules: tipo.regras,
          visitDate: data,
          dayKindOverride: dia.dayKind,
          now: instante,
          soldByRule: vendidos,
          quantity: qtd,
        });
        if (
          preco.ruleId &&
          tipo.regras.some((regra) => regra.id === preco.ruleId && regra.lotQuantity !== null)
        ) {
          vendidosPorLote.set(preco.ruleId, (vendidosPorLote.get(preco.ruleId) ?? 0) + qtd);
        }
        itens.push({
          tipo,
          quantidade: qtd,
          unitario: preco.priceCents,
          regraId: preco.ruleId,
          rotulo: preco.label,
        });
      };

      if (canal === 'ONLINE' && chance(0.08)) {
        adicionar(combo, 1);
        if (chance(0.3)) adicionar(adulto, 1);
      } else {
        adicionar(adulto, escolher([1, 1, 2, 2, 2, 2, 3, 4]));
        adicionar(infantil, escolher([0, 0, 1, 1, 2, 2, 3]));
        if (chance(0.14)) adicionar(meia, inteiro(1, 2));
        if (chance(0.12)) adicionar(colo, 1);
      }

      const subtotal = itens.reduce((soma, item) => soma + item.unitario * item.quantidade, 0);
      let cupom: Planejado['cupom'] = null;
      let desconto = 0;
      if (canal === 'ONLINE' && subtotal > 0 && instante >= cupomVerao.createdAt && chance(0.1)) {
        cupom = { id: cupomVerao.id, code: cupomVerao.code };
        desconto = applyBps(subtotal, 1000);
      } else if (subtotal >= 15000 && instante >= cupomFamilia.createdAt && chance(0.07)) {
        const usos = usosPorCpf.get(cliente.cpf) ?? 0;
        if (usos < 2) {
          usosPorCpf.set(cliente.cpf, usos + 1);
          cupom = { id: cupomFamilia.id, code: cupomFamilia.code };
          desconto = 2000;
        }
      }

      let situacao: Planejado['situacao'] = 'CONFIRMED';
      if (canal === 'ONLINE') {
        const sorte = sorteio();
        if (sorte < 0.055) situacao = 'EXPIRED';
        else if (sorte < 0.07) situacao = 'CANCELLED';
        else if (sorte < 0.078 && deslocamento > 0) situacao = 'REFUNDED';
      }

      planejados.push({
        id: uuidv7(instante.getTime()),
        createdAt: instante,
        dia,
        cliente,
        canal,
        itens,
        cupom,
        desconto,
        situacao,
        metodo: canal === 'POS' ? (chance(0.4) ? 'CASH' : 'CARD_TERMINAL') : 'PIX',
        origem: canal === 'ONLINE' ? escolher(ORIGENS) : null,
      });
    }
  }

  // Três pedidos aguardando pagamento agora, com as vagas seguradas.
  const proximoSabado = [...dias.values()].find((dia) => dia.date > hoje && weekdayOf(dia.date) === 6);
  if (proximoSabado) {
    for (let n = 0; n < 3; n++) {
      const instante = new Date(agora.getTime() - (4 + n * 3) * 60_000);
      const unitario = resolvePrice({
        basePriceCents: adulto.basePriceCents,
        rules: adulto.regras,
        visitDate: proximoSabado.date,
        dayKindOverride: proximoSabado.dayKind,
        now: instante,
      });
      planejados.push({
        id: uuidv7(instante.getTime()),
        createdAt: instante,
        dia: proximoSabado,
        cliente: escolher(clientes),
        canal: 'ONLINE',
        itens: [
          {
            tipo: adulto,
            quantidade: 2,
            unitario: unitario.priceCents,
            regraId: unitario.ruleId,
            rotulo: unitario.label,
          },
        ],
        cupom: null,
        desconto: 0,
        situacao: 'PENDING',
        metodo: 'PIX',
        origem: 'instagram',
      });
    }
  }

  planejados.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const pedidos: Prisma.OrderCreateManyInput[] = [];
  const itensDoPedido: Prisma.OrderItemCreateManyInput[] = [];
  const ingressos: Prisma.TicketCreateManyInput[] = [];
  const eventos: Prisma.TicketEventCreateManyInput[] = [];
  const pagamentos: Prisma.PaymentCreateManyInput[] = [];
  const transacoes: Prisma.PaymentTransactionCreateManyInput[] = [];
  const cobrancas: Prisma.DevMockChargeCreateManyInput[] = [];
  const usosDeCupom: Prisma.CouponUsageCreateManyInput[] = [];
  const reservas: Prisma.CapacityHoldCreateManyInput[] = [];
  const auditoria: Prisma.AuditLogCreateManyInput[] = [];
  const sequencias = new Map<number, number>();
  const codigosUsados = new Set<string>();

  for (const plano of planejados) {
    const ano = Number(todayIn(fuso, plano.createdAt).slice(0, 4));
    const numero = (sequencias.get(ano) ?? 0) + 1;
    sequencias.set(ano, numero);
    const codigo = formatOrderCode(parque.orderCodePrefix, ano, numero);

    const subtotal = plano.itens.reduce((soma, item) => soma + item.unitario * item.quantidade, 0);
    const total = subtotal - plano.desconto;
    const gratis = total === 0;
    const pago = plano.situacao === 'CONFIRMED' || plano.situacao === 'REFUNDED';
    const confirmadoEm = pago
      ? new Date(plano.createdAt.getTime() + (plano.canal === 'POS' ? 30_000 : inteiro(2, 18) * 60_000))
      : null;
    const venceEm =
      plano.canal === 'ONLINE' && !gratis ? new Date(plano.createdAt.getTime() + 30 * 60_000) : null;
    const canceladoEm =
      plano.situacao === 'CANCELLED'
        ? new Date(plano.createdAt.getTime() + inteiro(3, 20) * 60_000)
        : plano.situacao === 'REFUNDED'
          ? new Date(
              Math.min(
                agora.getTime() - 3_600_000,
                (confirmadoEm?.getTime() ?? 0) + inteiro(1, 3) * 86_400_000,
              ),
            )
          : null;

    const statusDoPedido =
      plano.situacao === 'PENDING'
        ? 'PENDING_PAYMENT'
        : plano.situacao === 'REFUNDED'
          ? 'CANCELLED'
          : plano.situacao;
    const financeiro = gratis
      ? 'NOT_APPLICABLE'
      : plano.situacao === 'REFUNDED'
        ? 'REFUNDED'
        : pago
          ? 'PAID'
          : 'UNPAID';

    pedidos.push({
      id: plano.id,
      parkId: parque.id,
      code: codigo,
      customerId: plano.cliente.id,
      buyerName: plano.cliente.name,
      buyerEmail: plano.cliente.email,
      buyerPhone: plano.cliente.phone,
      buyerCpfMasked: maskCpf(plano.cliente.cpf),
      parkDayId: plano.dia.id,
      visitDate: dateOnlyToDb(plano.dia.date),
      status: statusDoPedido,
      financialStatus: financeiro,
      channel: plano.canal,
      subtotalCents: subtotal,
      discountCents: plano.desconto,
      totalCents: total,
      couponId: plano.cupom?.id ?? null,
      soldById: plano.canal === 'POS' ? equipe.bilheteria : null,
      expiresAt: plano.situacao === 'PENDING' ? new Date(plano.createdAt.getTime() + 30 * 60_000) : venceEm,
      confirmedAt: confirmadoEm,
      cancelledAt: canceladoEm,
      cancelledById: canceladoEm ? equipe.admin : null,
      cancelReason:
        plano.situacao === 'CANCELLED'
          ? 'Cliente pediu o cancelamento antes de pagar'
          : plano.situacao === 'REFUNDED'
            ? 'Cliente desistiu dentro do prazo de 7 dias'
            : null,
      utmSource: plano.origem,
      utmMedium:
        plano.origem === 'instagram' || plano.origem === 'facebook'
          ? 'social'
          : plano.origem
            ? 'mensagem'
            : null,
      utmCampaign: plano.origem ? 'temporada-2026' : null,
      createdIp:
        plano.canal === 'ONLINE' ? `177.${inteiro(10, 200)}.${inteiro(0, 255)}.${inteiro(1, 254)}` : null,
      createdAt: plano.createdAt,
    });

    auditoria.push({
      parkId: parque.id,
      actorType: plano.canal === 'POS' ? 'USER' : 'CUSTOMER',
      actorUserId: plano.canal === 'POS' ? equipe.bilheteria : null,
      action: 'orders.created',
      entityType: 'order',
      entityId: plano.id,
      data: {
        code: codigo,
        channel: plano.canal,
        tickets: plano.itens.reduce((soma, item) => soma + item.quantidade * item.tipo.peoplePerTicket, 0),
        totalCents: total,
        coupon: plano.cupom?.code ?? null,
      },
      createdAt: plano.createdAt,
    });

    const descontos = allocateCents(
      plano.desconto,
      plano.itens.map((item) => item.unitario * item.quantidade),
    );
    const visitaTerminou = plano.dia.date < hoje || (plano.dia.date === hoje && agora >= criadoEm(hoje, 15));

    for (const [indice, item] of plano.itens.entries()) {
      const itemId = uuidv7(plano.createdAt.getTime());
      const descontoDoItem = descontos[indice] ?? 0;
      const totalDoItem = item.unitario * item.quantidade - descontoDoItem;
      itensDoPedido.push({
        id: itemId,
        orderId: plano.id,
        ticketTypeId: item.tipo.id,
        ticketPriceId: item.regraId,
        ticketTypeName: item.tipo.name,
        priceLabel: item.rotulo,
        quantity: item.quantidade,
        unitPriceCents: item.unitario,
        discountCents: descontoDoItem,
        totalCents: totalDoItem,
        createdAt: plano.createdAt,
      });

      const pessoas = item.quantidade * item.tipo.peoplePerTicket;
      const precos = allocateCents(
        totalDoItem,
        Array.from({ length: pessoas }, () => 1),
      );
      const sobrenome = plano.cliente.name.split(' ').at(-1) ?? 'Silva';
      for (let p = 0; p < pessoas; p++) {
        let codigoDoIngresso = randomCrockford(10);
        while (codigosUsados.has(codigoDoIngresso)) codigoDoIngresso = randomCrockford(10);
        codigosUsados.add(codigoDoIngresso);

        const infantilOuColo = item.tipo.idadeInfantil !== null;
        const nomeDoTitular =
          item.tipo.holderData === 'NONE'
            ? null
            : indice === 0 && p === 0 && !infantilOuColo
              ? plano.cliente.name
              : `${escolher(infantilOuColo ? NOMES_INFANTIS : NOMES)} ${sobrenome}`;
        const idade = item.tipo.idadeInfantil
          ? inteiro(item.tipo.idadeInfantil[0], item.tipo.idadeInfantil[1])
          : null;
        const nascimento =
          idade !== null
            ? `${Number(plano.dia.date.slice(0, 4)) - idade - 1}-${String(inteiro(1, 12)).padStart(2, '0')}-${String(inteiro(1, 28)).padStart(2, '0')}`
            : null;

        const utilizado =
          pago &&
          plano.situacao !== 'REFUNDED' &&
          visitaTerminou &&
          chance(plano.dia.date === hoje ? 0.72 : 0.93);
        const status =
          plano.situacao === 'PENDING'
            ? 'PENDING_PAYMENT'
            : plano.situacao === 'EXPIRED'
              ? 'EXPIRED'
              : plano.situacao === 'CANCELLED'
                ? 'CANCELLED'
                : plano.situacao === 'REFUNDED'
                  ? 'REFUNDED'
                  : utilizado
                    ? 'CHECKED_IN'
                    : 'ACTIVE';
        const entrada = utilizado ? criadoEm(plano.dia.date, inteiro(9, 13), inteiro(0, 59)) : null;
        const ticketId = uuidv7(plano.createdAt.getTime());

        ingressos.push({
          id: ticketId,
          parkId: parque.id,
          orderId: plano.id,
          orderItemId: itemId,
          ticketTypeId: item.tipo.id,
          customerId: plano.cliente.id,
          parkDayId: plano.dia.id,
          visitDate: dateOnlyToDb(plano.dia.date),
          code: codigoDoIngresso,
          status,
          holderName: nomeDoTitular,
          holderBirthDate:
            nascimento && item.tipo.holderData.includes('BIRTHDATE') ? dateOnlyToDb(nascimento) : null,
          occupiesCapacity: item.tipo.occupiesCapacity,
          priceCents: precos[p] ?? 0,
          activatedAt: confirmadoEm,
          checkedInAt: entrada,
          checkedInById: entrada ? equipe.portaria : null,
          cancelledAt: status === 'CANCELLED' || status === 'REFUNDED' ? canceladoEm : null,
          createdAt: plano.createdAt,
        });
        eventos.push({ ticketId, type: 'CREATED', createdAt: plano.createdAt });
        if (confirmadoEm) eventos.push({ ticketId, type: 'ACTIVATED', createdAt: confirmadoEm });
        if (entrada)
          eventos.push({ ticketId, type: 'CHECKED_IN', actorUserId: equipe.portaria, createdAt: entrada });
      }
    }

    if (plano.situacao === 'PENDING') {
      reservas.push({
        parkId: parque.id,
        parkDayId: plano.dia.id,
        orderId: plano.id,
        people: plano.itens.reduce((soma, item) => soma + item.quantidade * item.tipo.peoplePerTicket, 0),
        status: 'ACTIVE',
        expiresAt: new Date(plano.createdAt.getTime() + 30 * 60_000),
        createdAt: plano.createdAt,
      });
    }

    if (plano.cupom) {
      usosDeCupom.push({
        couponId: plano.cupom.id,
        orderId: plano.id,
        customerId: plano.cliente.id,
        cpfHash: hashCpf(plano.cliente.cpf),
        discountCents: plano.desconto,
        status:
          pago && plano.situacao !== 'REFUNDED'
            ? 'CONFIRMED'
            : plano.situacao === 'PENDING'
              ? 'RESERVED'
              : 'RELEASED',
        createdAt: plano.createdAt,
      });
    }

    if (!gratis) {
      const pagamentoId = uuidv7(plano.createdAt.getTime());
      const idNoProvedor = plano.metodo === 'PIX' ? `mock_seed${randomCrockford(16).toLowerCase()}` : null;
      const statusDoPagamento =
        plano.situacao === 'PENDING'
          ? 'AWAITING'
          : plano.situacao === 'EXPIRED'
            ? 'EXPIRED'
            : plano.situacao === 'CANCELLED'
              ? 'CANCELLED'
              : plano.situacao === 'REFUNDED'
                ? 'REFUNDED'
                : 'APPROVED';
      pagamentos.push({
        id: pagamentoId,
        parkId: parque.id,
        orderId: plano.id,
        provider: 'MOCK',
        method: plano.metodo,
        status: statusDoPagamento,
        amountCents: total,
        feeCents: pago ? 0 : null,
        netCents: pago ? total : null,
        refundedCents: plano.situacao === 'REFUNDED' ? total : 0,
        providerPaymentId: idNoProvedor,
        pixPayload: idNoProvedor ? mockPixPayload({ amountCents: total, txid: idNoProvedor }) : null,
        expiresAt: plano.metodo === 'PIX' ? new Date(plano.createdAt.getTime() + 30 * 60_000) : null,
        approvedAt: confirmadoEm,
        idempotencyKey: `seed:${plano.id}`,
        createdById: plano.canal === 'POS' ? equipe.bilheteria : null,
        createdAt: plano.createdAt,
      });
      transacoes.push({
        paymentId: pagamentoId,
        kind: 'CREATED',
        toStatus: 'AWAITING',
        amountCents: total,
        createdAt: plano.createdAt,
      });
      if (statusDoPagamento !== 'AWAITING') {
        transacoes.push({
          paymentId: pagamentoId,
          kind: plano.metodo === 'PIX' && pago ? 'WEBHOOK' : 'STATUS_CHANGED',
          fromStatus: 'AWAITING',
          toStatus: pago ? 'APPROVED' : statusDoPagamento,
          amountCents: total,
          createdAt: confirmadoEm ?? canceladoEm ?? venceEm ?? plano.createdAt,
        });
      }
      if (idNoProvedor) {
        cobrancas.push({
          id: idNoProvedor,
          amountCents: total,
          status: statusDoPagamento,
          createdAt: plano.createdAt,
        });
      }
    }

    if (confirmadoEm) {
      auditoria.push({
        parkId: parque.id,
        actorType: plano.canal === 'POS' ? 'USER' : gratis ? 'SYSTEM' : 'WEBHOOK',
        actorUserId: plano.canal === 'POS' ? equipe.bilheteria : null,
        action: 'orders.confirmed',
        entityType: 'order',
        entityId: plano.id,
        data: { code: codigo, totalCents: total },
        createdAt: confirmadoEm,
      });
    }
    if (plano.situacao === 'EXPIRED' && venceEm) {
      auditoria.push({
        parkId: parque.id,
        actorType: 'SYSTEM',
        action: 'orders.expired',
        entityType: 'order',
        entityId: plano.id,
        data: { code: codigo },
        createdAt: venceEm,
      });
    }
    if (canceladoEm) {
      auditoria.push({
        parkId: parque.id,
        actorType: 'USER',
        actorUserId: equipe.admin,
        action: plano.situacao === 'REFUNDED' ? 'orders.refunded' : 'orders.cancelled',
        entityType: 'order',
        entityId: plano.id,
        data: {
          code: codigo,
          reason:
            plano.situacao === 'REFUNDED'
              ? 'Cliente desistiu dentro do prazo de 7 dias'
              : 'Cliente pediu o cancelamento antes de pagar',
          ...(plano.situacao === 'REFUNDED' ? { amountCents: total } : {}),
        },
        createdAt: canceladoEm,
      });
    }
  }

  await db.$transaction(
    async (tx) => {
      await emLotes(pedidos, 400, (lote) => tx.order.createMany({ data: lote }));
      await emLotes(itensDoPedido, 800, (lote) => tx.orderItem.createMany({ data: lote }));
      await emLotes(ingressos, 1000, (lote) => tx.ticket.createMany({ data: lote }));
      await emLotes(eventos, 2000, (lote) => tx.ticketEvent.createMany({ data: lote }));
      await emLotes(cobrancas, 800, (lote) => tx.devMockCharge.createMany({ data: lote }));
      await emLotes(pagamentos, 800, (lote) => tx.payment.createMany({ data: lote }));
      await emLotes(transacoes, 1500, (lote) => tx.paymentTransaction.createMany({ data: lote }));
      await emLotes(usosDeCupom, 800, (lote) => tx.couponUsage.createMany({ data: lote }));
      if (reservas.length > 0) await tx.capacityHold.createMany({ data: reservas });
      await emLotes(auditoria, 1500, (lote) => tx.auditLog.createMany({ data: lote }));
      for (const [ano, ultimo] of sequencias) {
        await tx.orderSequence.upsert({
          where: { parkId_year: { parkId: parque.id, year: ano } },
          create: { parkId: parque.id, year: ano, lastValue: ultimo },
          update: { lastValue: ultimo },
        });
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  const confirmados = planejados.filter((plano) => plano.situacao === 'CONFIRMED').length;
  return [
    'Vendas:',
    `  ${tipos.length} tipos de ingresso, ${linhasDoCalendario.length} dias no calendário, 4 cupons, ${clientes.length} clientes`,
    `  ${pedidos.length} pedidos (${confirmados} confirmados, 3 aguardando pagamento), ${ingressos.length} ingressos`,
  ].join('\n');
}
