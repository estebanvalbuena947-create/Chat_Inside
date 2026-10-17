import { defineConfig } from 'vitest/config';

/**
 * Las pruebas de la web son de logica pura y de marcado: no montan componentes ni necesitan
 * navegador. El alcance se declara para no recorrer el resultado de `next build`, que vive en `.next`.
 */
export default defineConfig({
  // El tsconfig de Next deja `jsx: "preserve"` porque quien compila la interfaz es Next. Vitest no
  // tiene ese paso, asi que se declara el runtime automatico: el mismo que usa la aplicacion.
  esbuild: { jsx: 'automatic' },
  test: {
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**'],
    include: ['**/*.test.{ts,tsx}']
  }
});
