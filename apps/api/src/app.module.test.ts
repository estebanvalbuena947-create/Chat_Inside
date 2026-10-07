import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

// Las variables se fijan ANTES de importar el modulo: el cliente de Supabase las lee al construirse,
// y sin ellas la aplicacion no llega ni a montarse. Todos los valores son de mentira: esta prueba no
// habla con nadie, solo comprueba que Nest sabe construir el grafo.
vi.hoisted(() => {
  process.env.APP_ENV ??= 'test';
  process.env.API_PORT ??= '4000';
  process.env.APP_PUBLIC_URL ??= 'http://localhost:3000';
  process.env.SUPABASE_URL ??= 'https://ejemplo.supabase.co';
  process.env.SUPABASE_SECRET_KEY ??= 'clave-de-prueba';
  process.env.ZERNIO_API_KEY ??= 'clave-de-prueba';
  process.env.ZERNIO_WEBHOOK_SECRET ??= 'secreto-de-prueba';
});

import { AppModule } from './app.module';

/**
 * Arranque de la aplicacion.
 *
 * Existe por un fallo real: `CommentModerationService` tenia un argumento sin `@Inject`, y Nest no
 * pudo construirlo. El tipo, el lint, el build y las 461 pruebas pasaban -- porque todas instancian
 * los servicios a mano y ninguna pasa por la inyeccion de dependencias. La API se caia al arrancar
 * y nada lo decia.
 *
 * Esta prueba monta el modulo principal entero. Si algun proveedor no se puede resolver, falla aqui
 * en lugar de fallar al desplegar.
 */
describe('arranque de la aplicacion', () => {
  it('construye el modulo principal con todas sus dependencias resueltas', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef).toBeDefined();

    await moduleRef.close();
  });

  // El segundo caso -- arrancar la aplicacion con `createNestApplication()` -- se retiro a
  // proposito. Ese paso carga el adaptador HTTP con `loadPackage`, que cuando no lo encuentra llama
  // a `process.exit(1)`: dentro de una prueba eso termina el ejecutor entero en vez de lanzar un
  // error capturable. La inicializacion completa se comprueba arrancando la API y consultando
  // /health, que es una verificacion real y no una simulada.
});
