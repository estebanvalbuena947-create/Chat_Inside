import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePhoneE164 } from './contact-identifiers.js';

const MEXICO = '52';

describe('normalizar telefono', () => {
  it('deja intacto un telefono que ya viene en formato internacional', () => {
    expect(normalizePhoneE164('+5215512345678', MEXICO)).toEqual({
      ok: true,
      value: '+5215512345678'
    });
  });

  it('quita espacios, guiones, puntos y parentesis', () => {
    expect(normalizePhoneE164('+52 (155) 123-456.78', MEXICO)).toEqual({
      ok: true,
      value: '+5215512345678'
    });
  });

  it('aplica el pais indicado cuando el numero no trae prefijo', () => {
    expect(normalizePhoneE164('5512345678', MEXICO)).toEqual({ ok: true, value: '+525512345678' });
  });

  it('interpreta el prefijo internacional escrito como 00', () => {
    expect(normalizePhoneE164('005215512345678', MEXICO)).toEqual({
      ok: true,
      value: '+5215512345678'
    });
  });

  it('no supone el pais: sin codigo no puede normalizar', () => {
    expect(normalizePhoneE164('5512345678', '').ok).toBe(false);
  });

  it('rechaza un telefono vacio', () => {
    expect(normalizePhoneE164('   ', MEXICO).ok).toBe(false);
  });

  it('rechaza letras', () => {
    expect(normalizePhoneE164('+52 155 ABC 4567', MEXICO).ok).toBe(false);
  });

  it('rechaza un numero demasiado corto o demasiado largo', () => {
    expect(normalizePhoneE164('123', MEXICO).ok).toBe(false);
    expect(normalizePhoneE164('+1234567890123456', MEXICO).ok).toBe(false);
  });

  it('usa el pais de la configuracion, no uno escrito en el codigo', () => {
    expect(normalizePhoneE164('5512345678', '57')).toEqual({ ok: true, value: '+575512345678' });
  });
});

describe('normalizar correo', () => {
  it('lo pasa a minusculas y quita espacios', () => {
    expect(normalizeEmail('  Cliente@Ejemplo.COM ')).toEqual({
      ok: true,
      value: 'cliente@ejemplo.com'
    });
  });

  it('rechaza un correo vacio', () => {
    expect(normalizeEmail('  ').ok).toBe(false);
  });

  it('rechaza un correo sin arroba o con dos', () => {
    expect(normalizeEmail('cliente.ejemplo.com').ok).toBe(false);
    expect(normalizeEmail('a@b@c.com').ok).toBe(false);
  });

  it('rechaza un dominio sin punto', () => {
    expect(normalizeEmail('cliente@ejemplo').ok).toBe(false);
  });

  it('rechaza un correo demasiado largo', () => {
    expect(normalizeEmail(`${'a'.repeat(250)}@ejemplo.com`).ok).toBe(false);
  });
});
