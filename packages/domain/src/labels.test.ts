import { describe, expect, it } from 'vitest';
import { labelColorPalette, pickLabelColor } from './labels';

describe('label color', () => {
  it('uses a soft palette, never a saturated color', () => {
    for (const color of labelColorPalette) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      const [red, green, blue] = [1, 3, 5].map((index) =>
        Number.parseInt(color.slice(index, index + 2), 16)
      );
      // Pastel significa claro: ningun canal por debajo de 190 y ninguno a tope.
      expect(Math.min(red!, green!, blue!)).toBeGreaterThanOrEqual(190);
      expect(Math.max(red!, green!, blue!)).toBeLessThanOrEqual(250);
    }
  });

  it('prefers a color the tenant is not using yet', () => {
    const used = labelColorPalette.slice(0, 5) as unknown as string[];
    const picked = pickLabelColor({ existing: used, seed: 'Clientes frecuentes' });

    expect(used).not.toContain(picked);
    expect(labelColorPalette).toContain(picked);
  });

  it('keeps working when the whole palette is taken, choosing the least used', () => {
    const existing = [...labelColorPalette, ...labelColorPalette.slice(0, 3)];
    const picked = pickLabelColor({ existing, seed: 'Otro' });

    expect(labelColorPalette).toContain(picked);
    // Con la paleta completa, elige uno de los que menos se usan, no cualquiera.
    const count = existing.filter((color) => color === picked).length;
    const minimum = Math.min(
      ...labelColorPalette.map((color) => existing.filter((used) => used === color).length)
    );
    expect(count).toBe(minimum);
  });

  it('is reproducible for the same name and ignores colors outside the palette', () => {
    expect(pickLabelColor({ existing: [], seed: 'Pagos' })).toBe(
      pickLabelColor({ existing: ['#123456'], seed: 'Pagos' })
    );
  });
});
