import { isDateOnly } from '@/lib/dates';
import { requireApiAuth } from '@/server/auth/cookies';
import { daySpecialPricesSchema, getDayPricing, saveDaySpecialPrices } from '@/server/calendar/service';
import { Errors } from '@/server/errors';
import { ok, readJson, route } from '@/server/http';

interface DateRouteContext {
  params: Promise<{ date: string }>;
}

async function lerData(ctx: DateRouteContext): Promise<string> {
  const { date } = await ctx.params;
  if (!isDateOnly(date)) throw Errors.notFound();
  return date;
}

export const GET = route<DateRouteContext>(async ({ ctx }) => {
  const auth = await requireApiAuth();
  return ok(await getDayPricing(auth, await lerData(ctx)));
});

export const PUT = route<DateRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const date = await lerData(ctx);
  return ok(await saveDaySpecialPrices(auth, date, await readJson(req, daySpecialPricesSchema), meta));
});
