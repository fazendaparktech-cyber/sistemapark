import 'server-only';

import { DEFAULT_PARK_TIMEZONE } from '@/lib/dates';

import { prisma, type DbClient } from '../db';

export interface EnsureParkInput {
  name: string;
  slug: string;
  timezone?: string;
  orderCodePrefix?: string;
}

/** Cria o parque se ainda não existe (pelo slug). Não altera um parque existente. */
export async function ensurePark(input: EnsureParkInput, db: DbClient = prisma) {
  return db.park.upsert({
    where: { slug: input.slug },
    create: {
      name: input.name,
      slug: input.slug,
      timezone: input.timezone ?? DEFAULT_PARK_TIMEZONE,
      orderCodePrefix: input.orderCodePrefix ?? 'CP',
    },
    update: {},
    select: { id: true, name: true, slug: true, timezone: true, orderCodePrefix: true },
  });
}
