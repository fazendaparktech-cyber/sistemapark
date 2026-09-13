import 'server-only';

import { prisma, type DbClient } from '../db';
import { env } from '../env';
import { AppError } from '../errors';

/** Parque vendido pelo site público (um por instalação, definido em PARK_SLUG). */
export interface PublicPark {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  orderCodePrefix: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

export async function getPublicPark(db: DbClient = prisma): Promise<PublicPark> {
  const parque = await db.park.findFirst({
    where: { slug: env().PARK_SLUG, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      timezone: true,
      orderCodePrefix: true,
      email: true,
      phone: true,
      whatsapp: true,
      addressLine: true,
      city: true,
      state: true,
      postalCode: true,
    },
  });
  if (!parque) throw new AppError('SERVICE_UNAVAILABLE', 'O site de vendas ainda não foi configurado.');
  return parque;
}
