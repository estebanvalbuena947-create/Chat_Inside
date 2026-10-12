import { describe, expect, it } from 'vitest';
import { FASTIFY_OPTIONS, createHttpAdapter } from './http-adapter';

describe('adaptador HTTP', () => {
  it('acepta identificadores de recurso de Google en las rutas de reseñas', () => {
    const adapter = createHttpAdapter();

    expect(FASTIFY_OPTIONS).toEqual({
      bodyLimit: 262_144,
      routerOptions: { maxParamLength: 512 }
    });
    expect(adapter.getInstance().initialConfig.routerOptions?.maxParamLength).toBe(512);
  });
});
