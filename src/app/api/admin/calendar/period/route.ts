import { requireApiAuth } from '@/server/auth/cookies';
import { applyCalendarPeriod, calendarPeriodSchema } from '@/server/calendar/service';
import { ok, readJson, route } from '@/server/http';

export const POST = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const dados = await readJson(req, calendarPeriodSchema);
  return ok(await applyCalendarPeriod(auth, dados, meta));
});
