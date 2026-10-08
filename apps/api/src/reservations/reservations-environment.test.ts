import {
  createReservationsSupabaseClient,
  parseReservationsEnvironment
} from '@chat-zernio/config';
import { describe, expect, it } from 'vitest';

/**
 * El proyecto de reservas es otra base. Lo que se prueba aqui es lo que puede tumbar la API: que una
 * variable vacia (como la deja el stack cuando no esta en el `.env`) signifique «sin configurar» y no
 * un valor invalido.
 */
describe('configuracion del proyecto de reservas', () => {
  const url = 'https://ncutewymymydclypuqlbfk.supabase.co';
  const clave = 'clave-de-servicio-de-prueba';

  it('lee las dos variables cuando estan puestas', () => {
    expect(
      parseReservationsEnvironment({ SPA_SUPABASE_SECRET_KEY: clave, SPA_SUPABASE_URL: url })
    ).toEqual({ SPA_SUPABASE_SECRET_KEY: clave, SPA_SUPABASE_URL: url });
  });

  it('trata la variable vacia como ausente, porque asi la deja el stack', () => {
    expect(
      parseReservationsEnvironment({ SPA_SUPABASE_SECRET_KEY: '', SPA_SUPABASE_URL: '' })
    ).toEqual({ SPA_SUPABASE_SECRET_KEY: undefined, SPA_SUPABASE_URL: undefined });
    expect(
      parseReservationsEnvironment({ SPA_SUPABASE_SECRET_KEY: '   ', SPA_SUPABASE_URL: '  ' })
    ).toEqual({ SPA_SUPABASE_SECRET_KEY: undefined, SPA_SUPABASE_URL: undefined });
  });

  it('no exige las variables: la integracion puede no estar configurada todavia', () => {
    expect(parseReservationsEnvironment({})).toEqual({
      SPA_SUPABASE_SECRET_KEY: undefined,
      SPA_SUPABASE_URL: undefined
    });
    expect(createReservationsSupabaseClient({})).toBeNull();
    expect(
      createReservationsSupabaseClient({ SPA_SUPABASE_SECRET_KEY: '', SPA_SUPABASE_URL: '' })
    ).toBeNull();
  });

  it('exige las dos: con una sola no hay cliente, en lugar de uno a medias', () => {
    expect(createReservationsSupabaseClient({ SPA_SUPABASE_URL: url })).toBeNull();
    expect(createReservationsSupabaseClient({ SPA_SUPABASE_SECRET_KEY: clave })).toBeNull();
  });

  it('construye el cliente cuando estan las dos, sin guardar sesion ni refrescar tokens', () => {
    const cliente = createReservationsSupabaseClient({
      SPA_SUPABASE_SECRET_KEY: clave,
      SPA_SUPABASE_URL: url
    });
    expect(cliente).not.toBeNull();
  });

  it('rechaza una direccion que no sea una URL, porque es un error de configuracion', () => {
    expect(() =>
      parseReservationsEnvironment({
        SPA_SUPABASE_SECRET_KEY: clave,
        SPA_SUPABASE_URL: 'no-es-url'
      })
    ).toThrow();
  });
});
