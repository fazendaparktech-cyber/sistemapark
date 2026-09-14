import { todayIn } from '@/lib/dates';
import { parsePeriod } from '@/lib/periods';
import { isReportKey } from '@/lib/reports';
import { requireApiAuth } from '@/server/auth/cookies';
import { Errors } from '@/server/errors';
import { route } from '@/server/http';
import { exportReport } from '@/server/reports/service';

interface KeyRouteContext {
  params: Promise<{ key: string }>;
}

export const GET = route<KeyRouteContext>(async ({ req, ctx, meta }) => {
  const auth = await requireApiAuth();
  const { key } = await ctx.params;
  if (!isReportKey(key)) throw Errors.notFound();
  const busca = req.nextUrl.searchParams;
  const periodo = parsePeriod(
    { periodo: busca.get('periodo'), de: busca.get('de'), ate: busca.get('ate') },
    todayIn(auth.park.timezone),
    'mes',
  );
  const arquivo = await exportReport(
    auth,
    key,
    periodo,
    busca.get('formato') === 'xlsx' ? 'xlsx' : 'csv',
    meta,
  );
  return new Response(typeof arquivo.body === 'string' ? arquivo.body : new Uint8Array(arquivo.body), {
    headers: {
      'content-type': arquivo.contentType,
      'content-disposition': `attachment; filename="${arquivo.filename}"`,
      'cache-control': 'no-store',
    },
  });
});
