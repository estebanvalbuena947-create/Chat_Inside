import { describe, expect, it } from 'vitest';
import {
  hasMetaUserIdentifiers,
  metaUserIdentifiers,
  SIN_IDENTIFICADORES_DEL_CLIENTE
} from './meta-user-identifiers';

describe('identificadores del cliente para Meta', () => {
  it('usa la referencia externa, que es la columna que el sistema si rellena', () => {
    // Este es el caso real medido: `platform_user_id` vacio y `external_reference` lleno. Antes se
    // leia solo el primero, asi que TODA conversion se descartaba por falta de identificadores.
    const user = metaUserIdentifiers(
      { externalReference: 'a1b2c3', platformUserId: null },
      { includeContactData: false }
    );

    expect(user).toEqual({ externalId: 'a1b2c3' });
    expect(hasMetaUserIdentifiers(user)).toBe(true);
  });

  it('cae al identificador de plataforma cuando no hay referencia externa', () => {
    expect(
      metaUserIdentifiers({ platformUserId: 'psid-9' }, { includeContactData: false })
    ).toEqual({ externalId: 'psid-9' });
  });

  it('prefiere la referencia externa si estan las dos', () => {
    expect(
      metaUserIdentifiers(
        { externalReference: 'ref', platformUserId: 'plat' },
        { includeContactData: false }
      )
    ).toEqual({ externalId: 'ref' });
  });

  it('no manda correo ni telefono si la configuracion no lo permite', () => {
    const user = metaUserIdentifiers(
      { email: 'ana@ejemplo.com', externalReference: 'ref', phoneE164: '+525512345678' },
      { includeContactData: false }
    );

    expect(user).toEqual({ externalId: 'ref' });
  });

  it('los manda cuando la configuracion lo permite', () => {
    const user = metaUserIdentifiers(
      { email: 'ana@ejemplo.com', externalReference: 'ref', phoneE164: '+525512345678' },
      { includeContactData: true }
    );

    expect(user).toEqual({ email: 'ana@ejemplo.com', externalId: 'ref', phone: '+525512345678' });
  });

  it('un valor en blanco no es un identificador', () => {
    const user = metaUserIdentifiers(
      { email: '   ', externalReference: '', phoneE164: null, platformUserId: '  ' },
      { includeContactData: true }
    );

    expect(user).toEqual({});
    expect(hasMetaUserIdentifiers(user)).toBe(false);
  });

  it('sin nada con lo que identificar al cliente devuelve vacio', () => {
    expect(metaUserIdentifiers({}, { includeContactData: true })).toEqual({});
  });

  it('el motivo del descarte es uno solo, compartido por los dos caminos', () => {
    expect(SIN_IDENTIFICADORES_DEL_CLIENTE).toBe('Sin identificadores del cliente.');
  });
});
