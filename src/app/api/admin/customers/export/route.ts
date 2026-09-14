import { requireApiAuth } from '@/server/auth/cookies';
import { csvResponse } from '@/server/csv';
import { exportCustomersCsv } from '@/server/customers/service';
import { parseCustomerFilters, searchParamsOf } from '@/server/filters';
import { route } from '@/server/http';

export const GET = route(async ({ req, meta }) => {
  const auth = await requireApiAuth();
  const { filename, content } = await exportCustomersCsv(
    auth,
    parseCustomerFilters(searchParamsOf(req.nextUrl)),
    meta,
  );
  return csvResponse(filename, content);
});
