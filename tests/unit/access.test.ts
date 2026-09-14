import { describe, expect, it } from 'vitest';

import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_DEFINITIONS,
  ROLE_KEYS,
  defaultPermissionsFor,
  isPermissionKey,
  type PermissionKey,
} from '@/lib/access';

function papeisCom(permissao: PermissionKey) {
  return ROLE_KEYS.filter((papel) => defaultPermissionsFor(papel).includes(permissao));
}

describe('catálogo de permissões', () => {
  it('não repete chaves e segue o padrão modulo.acao', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const chave of ALL_PERMISSIONS) expect(chave).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it('tem rótulo em português para toda permissão', () => {
    for (const chave of ALL_PERMISSIONS) expect(PERMISSION_LABELS[chave].length).toBeGreaterThan(5);
  });

  it('define cada papel exatamente uma vez', () => {
    expect(ROLE_DEFINITIONS.map((papel) => papel.key).sort()).toEqual([...ROLE_KEYS].sort());
  });

  it('papéis só usam permissões que existem, sem repetição', () => {
    for (const papel of ROLE_KEYS) {
      const permissoes = defaultPermissionsFor(papel);
      expect(new Set(permissoes).size).toBe(permissoes.length);
      for (const permissao of permissoes) expect(isPermissionKey(permissao)).toBe(true);
    }
  });
});

describe('matriz padrão (docs/ARQUITETURA.md, seção 13)', () => {
  it('super admin e administrador têm todas as permissões', () => {
    expect(defaultPermissionsFor('SUPER_ADMIN')).toEqual(ALL_PERMISSIONS);
    expect(defaultPermissionsFor('ADMIN')).toEqual(ALL_PERMISSIONS);
  });

  it('portaria só escaneia, busca ingresso e acompanha as entradas', () => {
    expect([...defaultPermissionsFor('GATE')].sort()).toEqual([
      'checkin.manual',
      'checkin.monitor',
      'checkin.scan',
    ]);
  });

  it('só administradores mexem em usuários, permissões, configurações e integrações', () => {
    expect(papeisCom('users.manage')).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(papeisCom('roles.manage')).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(papeisCom('settings.manage')).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(papeisCom('integrations.manage')).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(papeisCom('customers.export')).toEqual(['SUPER_ADMIN', 'ADMIN']);
  });

  it('reembolso só é feito por administradores e financeiro', () => {
    expect(papeisCom('refunds.approve')).toEqual(['SUPER_ADMIN', 'ADMIN', 'FINANCE']);
  });

  it('bilheteria vende e consulta, mas não cancela, não reembolsa e não vê faturamento', () => {
    const bilheteria = defaultPermissionsFor('BOX_OFFICE');
    for (const permissao of ['pos.sell', 'orders.view', 'customers.view', 'tickets.view'] as const)
      expect(bilheteria).toContain(permissao);
    for (const permissao of ['orders.cancel', 'refunds.approve', 'dashboard.financial', 'finance.view'] as const)
      expect(bilheteria).not.toContain(permissao);
  });

  it('marketing vê métricas, cupons e origem, sem acesso a vendas individuais e clientes', () => {
    const marketing = defaultPermissionsFor('MARKETING');
    for (const permissao of ['marketing.view', 'marketing.manage', 'coupons.manage'] as const)
      expect(marketing).toContain(permissao);
    for (const permissao of ['orders.view', 'customers.view', 'finance.view', 'dashboard.financial'] as const)
      expect(marketing).not.toContain(permissao);
  });
});
