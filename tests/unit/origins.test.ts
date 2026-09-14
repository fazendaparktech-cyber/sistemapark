import { describe, expect, it } from 'vitest';

import { hostOf, originOf } from '@/lib/origins';

describe('origem das vendas', () => {
  it('usa a campanha antes do site de origem', () => {
    expect(originOf({ utmSource: 'instagram', referrerHost: 'google.com' })).toBe('INSTAGRAM');
    expect(originOf({ utmSource: 'IG', referrerHost: null })).toBe('INSTAGRAM');
    expect(originOf({ utmSource: 'facebook_ads', referrerHost: null })).toBe('FACEBOOK');
    expect(originOf({ utmSource: 'tiktok', referrerHost: null })).toBe('TIKTOK');
    expect(originOf({ utmSource: 'google', referrerHost: null })).toBe('GOOGLE');
    expect(originOf({ utmSource: 'whatsapp', referrerHost: null })).toBe('WHATSAPP');
    expect(originOf({ utmSource: 'panfleto', referrerHost: null })).toBe('OTHER');
  });

  it('sem campanha, reconhece o site de onde a pessoa veio', () => {
    expect(originOf({ utmSource: null, referrerHost: 'l.instagram.com' })).toBe('INSTAGRAM');
    expect(originOf({ utmSource: '', referrerHost: 'www.google.com.br' })).toBe('GOOGLE');
    expect(originOf({ utmSource: null, referrerHost: 'm.facebook.com' })).toBe('FACEBOOK');
    expect(originOf({ utmSource: null, referrerHost: 'wa.me' })).toBe('WHATSAPP');
    expect(originOf({ utmSource: null, referrerHost: 'blogdoparque.com' })).toBe('OTHER');
  });

  it('sem origem, ou vindo do próprio site, é acesso direto', () => {
    expect(originOf({ utmSource: null, referrerHost: null })).toBe('DIRECT');
    expect(
      originOf({
        utmSource: null,
        referrerHost: 'ingressos.conquistapark.com.br',
        ownHost: 'ingressos.conquistapark.com.br',
      }),
    ).toBe('DIRECT');
    expect(hostOf('https://www.instagram.com/p/abc')).toBe('instagram.com');
    expect(hostOf('nao e url')).toBeNull();
  });
});
