import { isDateOnly } from '@/lib/dates';
import { z } from '@/lib/validation';
import { requirePermission } from '@/server/auth/context';
import { requireApiAuth } from '@/server/auth/cookies';
import { getCalendarRange } from '@/server/calendar/service';
import { ok, readQuery, route } from '@/server/http';

const intervalo = z.object({
  de: z.string().refine(isDateOnly, 'Data inválida'),
  ate: z.string().refine(isDateOnly, 'Data inválida'),
});

export const GET = route(async ({ req }) => {
  const auth = await requireApiAuth();
  requirePermission(auth, 'calendar.view');
  const { de, ate } = readQuery(req, intervalo);
  return ok(await getCalendarRange(auth.park.id, de, ate));
});
