import { isDateOnly } from '@/lib/dates';
import { requireApiAuth } from '@/server/auth/cookies';
import { calendarDaySchema, saveCalendarDay } from '@/server/calendar/service';
import { Errors } from '@/server/errors';
import { ok, readJson, route } from '@/server/http';

interface DateRouteContext {
  params: Promise<{ date: string }>;
}

export const PUT = route<DateRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const { date } = await ctx.params;
  if (!isDateOnly(date)) throw Errors.notFound();
  const dados = await readJson(req, calendarDaySchema);
  return ok(await saveCalendarDay(auth, date, dados, meta));
});
