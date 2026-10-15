import { defineConfig } from 'vitest/config';

/**
 * Las pruebas de la web son de logica pura: no montan componentes ni necesitan navegador. El alcance
 * se declara para no recorrer el resultado de `next build`, que vive en `.next`.
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**'],
    include: ['**/*.test.{ts,tsx}']
  }
});
