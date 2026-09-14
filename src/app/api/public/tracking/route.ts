import { publicTrackingEventSchema } from '@/lib/marketing';
import { ok, readJson, route } from '@/server/http';
import { recordPublicTrackingEvent } from '@/server/marketing/service';
import { getPublicPark } from '@/server/parks/public';

/** Passos do funil vistos no navegador: visualização dos ingressos e início do checkout. */
export const POST = route(async ({ req, meta }) => {
  const dados = await readJson(req, publicTrackingEventSchema);
  const parque = await getPublicPark();
  return ok(await recordPublicTrackingEvent(parque.id, dados, meta), { status: 202 });
});
