import { addDays, dayBounds } from '@/lib/dates';
import { uuidSchema, z } from '@/lib/validation';
import { listAuditLogs } from '@/server/audit';
import { requireApiAuth } from '@/server/auth/cookies';
import { ok, readQuery, route } from '@/server/http';

const filtros = z.object({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(100).optional(),
  actorUserId: uuidSchema.optional(),
  from: z.iso.date({ error: 'Data inicial inválida' }).optional(),
  to: z.iso.date({ error: 'Data final inválida' }).optional(),
  cursor: z.string().max(300).optional(),
});

export const GET = route(async ({ req }) => {
  const auth = await requireApiAuth();
  const { from, to, ...resto } = readQuery(req, filtros);
  // Datas do filtro são dias do parque: "até 13/09" inclui o dia 13 inteiro.
  return ok(
    await listAuditLogs(auth, {
      ...resto,
      from: from ? dayBounds(from, auth.park.timezone).start : undefined,
      to: to ? dayBounds(addDays(to, 1), auth.park.timezone).start : undefined,
    }),
  );
});
