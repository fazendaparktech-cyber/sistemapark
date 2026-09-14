import { describe, expect, it } from 'vitest';

import {
  getOperationsSettings,
  getParkLogo,
  removeParkLogo,
  updateOperationsSettings,
  updateParkLogo,
} from '@/server/settings/service';

import { authAs, createUser, expectAppError, lastAudit, meta } from '../helpers/factories';
import { criarParqueDeVendas } from '../helpers/sales';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('configurações do parque', () => {
  it('funcionamento padrão valida dias e horários e fica na auditoria', async () => {
    const { parque, auth } = await criarParqueDeVendas();
    expect(await getOperationsSettings(parque.id)).toEqual({
      openWeekdays: [0, 6],
      opensAt: '09:00',
      closesAt: '17:00',
      capacity: 1000,
    });

    await expectAppError(
      updateOperationsSettings(
        auth,
        { openWeekdays: [], opensAt: '18:00', closesAt: '09:00', capacity: 0 },
        meta(),
      ),
      'VALIDATION_ERROR',
    );
    const salvo = await updateOperationsSettings(
      auth,
      { openWeekdays: [6, 0, 5, 6], opensAt: '08:30', closesAt: '17:30', capacity: 1500 },
      meta(),
    );
    expect(salvo).toEqual({ openWeekdays: [0, 5, 6], opensAt: '08:30', closesAt: '17:30', capacity: 1500 });
    expect(await getOperationsSettings(parque.id)).toEqual(salvo);
    expect(await lastAudit('settings.operations_updated', 'operations')).toMatchObject({ parkId: parque.id });
  });

  it('logo aceita só imagem de verdade, até 300 KB, e só de quem gerencia as configurações', async () => {
    const { parque, auth } = await criarParqueDeVendas();

    expect(
      (await updateParkLogo(auth, { dataUrl: `data:image/png;base64,${PNG_1X1}` }, meta())).version,
    ).toBeGreaterThan(0);
    const logo = await getParkLogo(parque.id);
    expect(logo?.mime).toBe('image/png');
    expect(Buffer.from(logo?.data ?? new Uint8Array()).toString('base64')).toBe(PNG_1X1);

    const svgDisfarcado = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString(
      'base64',
    );
    await expectAppError(
      updateParkLogo(auth, { dataUrl: `data:image/png;base64,${svgDisfarcado}` }, meta()),
      'VALIDATION_ERROR',
    );
    const grande = Buffer.alloc(300_001, 0x89).toString('base64');
    await expectAppError(
      updateParkLogo(auth, { dataUrl: `data:image/png;base64,${grande}` }, meta()),
      'VALIDATION_ERROR',
    );

    const marketing = await authAs(await createUser({ parkId: parque.id, roles: ['MARKETING'] }), parque.id);
    await expectAppError(
      updateParkLogo(marketing.auth, { dataUrl: `data:image/png;base64,${PNG_1X1}` }, meta()),
      'FORBIDDEN',
    );

    await removeParkLogo(auth, meta());
    expect(await getParkLogo(parque.id)).toBeNull();
    expect(await lastAudit('settings.logo_removed', parque.id)).not.toBeNull();
  });
});
