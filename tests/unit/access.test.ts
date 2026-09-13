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

  it('portaria só lê QR e libera entrada', () => {
    expect([...defaultPermissionsFor('GATE')].sort()).toEqual(['checkin.manual', 'checkin.scan']);
  });

  it('só administradores mexem em equipe, permissões e integrações', () => {
    expect(papeisCom('users.manage')).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(papeisCom('roles.manage')).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(papeisCom('integrations.manage')).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(papeisCom('customers.export')).toEqual(['SUPER_ADMIN', 'ADMIN']);
  });

  it('reembolso só é aprovado por administradores e financeiro', () => {
    expect(papeisCom('refunds.approve')).toEqual(['SUPER_ADMIN', 'ADMIN', 'FINANCE']);
  });

  it('leitura não altera nada', () => {
    const escrita =
      /\.(manage|cancel|export|resend|create|approve|request|reconcile|sell|discount|operate|send|scan|manual)$/;
    for (const permissao of defaultPermissionsFor('READ_ONLY')) expect(permissao).not.toMatch(escrita);
  });
});
