import { requireApiAuth } from '@/server/auth/cookies';
import { csvResponse } from '@/server/csv';
import { parseOrderFilters, searchParamsOf } from '@/server/filters';
import { route } from '@/server/http';
import { exportOrdersCsv } from '@/server/orders/admin';

export const GET = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const { filename, content } = await exportOrdersCsv(
    auth,
    parseOrderFilters(searchParamsOf(req.nextUrl)),
    meta,
  );
  return csvResponse(filename, content);
});
