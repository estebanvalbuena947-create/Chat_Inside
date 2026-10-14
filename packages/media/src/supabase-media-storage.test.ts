import { describe, expect, it, vi } from 'vitest';
import { supabaseMediaStorage } from './supabase-media-storage';

/**
 * El adaptador del almacen.
 *
 * Dos cosas que importan y que no se ven en el tipo: un almacen que no sabe borrar tiene que decir
 * `false` en lugar de fingir que limpio, y el borrado se pide por ruta, no por identificador.
 */
describe('almacen de Supabase', () => {
  it('sube con su tipo y sin pedir confirmacion de sobrescritura al usuario', async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const storage = supabaseMediaStorage({ storage: { from: () => ({ upload }) } });

    const guardado = await storage.upload({
      bucket: 'branch-media',
      bytes: Buffer.from('hola'),
      contentType: 'image/jpeg',
      path: 'tenant/branch/foto.jpg'
    });

    expect(guardado).toBe(true);
    expect(upload).toHaveBeenCalledWith('tenant/branch/foto.jpg', expect.any(Buffer), {
      contentType: 'image/jpeg',
      upsert: true
    });
  });

  it('borra por ruta y confirma cuando el almacen responde bien', async () => {
    const remove = vi.fn(async () => ({ error: null }));
    // El tipo del almacen pide tambien `upload`; se da, aunque esta prueba no lo use.
    const storage = supabaseMediaStorage({
      storage: { from: () => ({ remove, upload: vi.fn() }) }
    });

    const borrado = await storage.remove?.({
      bucket: 'branch-media',
      path: 'tenant/branch/foto.jpg'
    });

    expect(borrado).toBe(true);
    expect(remove).toHaveBeenCalledWith(['tenant/branch/foto.jpg']);
  });

  it('un error del almacen no se convierte en un borrado exitoso', async () => {
    const remove = vi.fn(async () => ({ error: { message: 'sin permiso' } }));
    const storage = supabaseMediaStorage({
      storage: { from: () => ({ remove, upload: vi.fn() }) }
    });

    expect(await storage.remove?.({ bucket: 'branch-media', path: 'x.jpg' })).toBe(false);
  });

  it('un almacen sin borrado lo dice, no inventa un exito', async () => {
    const storage = supabaseMediaStorage({ storage: { from: () => ({ upload: vi.fn() }) } });

    expect(await storage.remove?.({ bucket: 'branch-media', path: 'x.jpg' })).toBe(false);
  });
});
