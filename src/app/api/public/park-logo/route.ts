import { Errors } from '@/server/errors';
import { route } from '@/server/http';
import { getPublicPark } from '@/server/parks/public';
import { getParkLogo } from '@/server/settings/service';

/** Logo enviada em Configurações. O endereço leva a versão (?v=), então pode ficar em cache. */
export const GET = route(async () => {
  const parque = await getPublicPark();
  const logo = await getParkLogo(parque.id);
  if (!logo) throw Errors.notFound('Logo não enviada.');
  return new Response(new Uint8Array(logo.data), {
    headers: {
      'content-type': logo.mime,
      'content-length': String(logo.data.length),
      'cache-control': 'public, max-age=86400',
    },
  });
});
