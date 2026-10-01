/**
 * Color de las etiquetas.
 *
 * La paleta es pastel a proposito: el color sirve para reconocer una etiqueta de un vistazo,
 * no para competir con el contenido de la conversacion. La eleccion es automatica al crear,
 * y evita repetir un color que el tenant ya este usando mientras queden libres.
 */
export const labelColorPalette = [
  '#f6d5d5',
  '#f9e2c8',
  '#f7f0c6',
  '#d9edcc',
  '#cfe8e4',
  '#d3e2f7',
  '#e0d7f5',
  '#f6d9ec'
] as const;

function seedValue(seed: string): number {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.codePointAt(0)!) % 1_000_003;
  }
  return hash;
}

/**
 * Elige el color de una etiqueta nueva.
 *
 * Prefiere un color que el tenant no tenga; si ya se usaron todos, toma el menos usado. La
 * semilla (el nombre) hace que dos creaciones simultaneas no caigan siempre en el mismo color
 * y que el resultado sea reproducible en las pruebas.
 */
export function pickLabelColor(input: { existing: string[]; seed: string }): string {
  const counts = new Map<string, number>();
  for (const color of labelColorPalette) counts.set(color, 0);
  for (const color of input.existing) {
    if (counts.has(color)) counts.set(color, (counts.get(color) ?? 0) + 1);
  }

  const unused = labelColorPalette.filter((color) => (counts.get(color) ?? 0) === 0);
  const candidates =
    unused.length > 0
      ? unused
      : [...labelColorPalette].sort((left, right) => {
          const difference = (counts.get(left) ?? 0) - (counts.get(right) ?? 0);
          return difference !== 0
            ? difference
            : labelColorPalette.indexOf(left) - labelColorPalette.indexOf(right);
        });

  return candidates[seedValue(input.seed) % candidates.length]!;
}
