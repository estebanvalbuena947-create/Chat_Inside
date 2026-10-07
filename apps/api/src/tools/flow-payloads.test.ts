import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Los cuerpos de salida de los flujos, tal como se despliegan.
 *
 * Los flujos viven en `Flujos_v2/` y no pasan por ningun control: son datos que se editan a mano y
 * se pegan en n8n. Eso dejo pasar un cuerpo con saltos de linea sin escapar que n8n no puede
 * interpretar —el nodo falla con "JSON parameter needs to be valid JSON" y el mensaje no sale— y
 * otro con la secuencia al reves, que es el error que se cuela al escribir el cuerpo a mano.
 *
 * Esta prueba lee los archivos que SI se despliegan y exige que cada cuerpo dirigido a nuestra API
 * se pueda interpretar igual que lo hace n8n: quitando el `=` de la expresion, sustituyendo las
 * interpolaciones por un valor de ejemplo y parseando el resultado.
 *
 * Trabaja sobre la forma, no sobre el contenido: no comprueba textos ni claves. Vive en este paquete
 * porque el contrato que esos cuerpos tienen que cumplir es el de estas tools.
 */

/**
 * La carpeta de los flujos.
 *
 * Se prueba mas de una ubicacion a proposito: la prueba puede ejecutarse desde el paquete (donde
 * vive) o desde la raiz del repositorio, y no queremos que una de las dos formas la deje buscando
 * archivos que no encuentra — ni, peor, pasando en vacio.
 */
function carpetaDeFlujos(): string {
  const candidatas = [
    join(process.cwd(), '..', '..', 'Flujos_v2'),
    join(process.cwd(), 'Flujos_v2')
  ];
  if (typeof __dirname === 'string') {
    candidatas.push(join(__dirname, '..', '..', '..', '..', 'Flujos_v2'));
  }
  const encontrada = candidatas.find((candidata) => existsSync(candidata));
  if (!encontrada) {
    throw new Error('No se encontro Flujos_v2. Se probo: ' + candidatas.join(' | '));
  }
  return encontrada;
}

const CARPETA = carpetaDeFlujos();
const UUID_EJEMPLO = '1712348f-7b5c-4bad-9b7d-c79b81b8bd72';

type Nodo = { name: string; parameters?: Record<string, unknown> };

/** Sustituye lo dinamico por un valor de ejemplo. Solo cubre las formas que usan los flujos. */
function interpretarCuerpo(crudo: string): Record<string, unknown> {
  let texto = crudo.startsWith('=') ? crudo.slice(1) : crudo;
  // Hay DOS formas, y n8n las trata distinto:
  //   a) un texto JSON con interpolaciones dentro -> se resuelven y se parsea el texto;
  //   b) UNA expresion que devuelve un objeto -> n8n la evalua y manda el objeto tal cual, asi que
  //      sus claves pueden ir sin comillas y no es JSON hasta citarlas.
  const esObjeto = texto.startsWith('{{');
  if (esObjeto) {
    texto = texto.slice(2, texto.length - 2).trim();
    // En un objeto JS las referencias van sin comillas; el JSON de al lado pone las suyas.
    texto = texto.replace(
      /String\(\$\([^)]*\)\.first\(\)\.json\.conversationId\)/g,
      JSON.stringify(UUID_EJEMPLO)
    );
    texto = texto.replace(
      /String\(\$\([^)]*\)\.first\(\)\.json\.subscriber_id\)/g,
      JSON.stringify(UUID_EJEMPLO)
    );
    texto = texto.replace(
      /\$\([^)]*\)\.first\(\)\.json\.conversationId/g,
      JSON.stringify(UUID_EJEMPLO)
    );
    texto = texto.replace(
      /\$\([^)]*\)\.first\(\)\.json\.subscriber_id/g,
      JSON.stringify(UUID_EJEMPLO)
    );
    texto = texto.replace(
      /\$\([^)]*\)\.first\(\)\.json\.output\.data/g,
      '[{"field_name":"Parte 1","field_value":"TEXTO"}]'
    );
    texto = texto.replace(
      /\$json\.output\.data/g,
      '[{"field_name":"Parte 1","field_value":"TEXTO"}]'
    );
    // Cualquier otra referencia a un nodo: un valor de texto cualquiera.
    texto = texto.replace(/\$\([^)]*\)\.first\(\)\.json\.[A-Za-z0-9_.]+/g, '"TEXTO"');
    texto = texto.replace(/\$json\.[A-Za-z0-9_.]+/g, '"TEXTO"');
    // Ya solo queda normalizar el literal: quitar envoltorios, citar cadenas y claves.
    texto = texto.replace(/\b(?:Number|String)\((\s*"[^"]*"\s*|\s*\[[^\]]*\]\s*)\)/g, '$1');
    texto = texto.replace(/'([^']*)'/g, '"$1"');
    texto = texto.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  } else {
    // El sustituto tiene que valer en los dos contextos que usan los flujos: dentro de comillas
    // ("conversationId": "{{ … }}") y ocupando el lugar de un valor ("field_value": {{ … }}). Un
    // numero es JSON valido en ambos, asi que sirve para comprobar la forma del cuerpo.
    texto = texto.replace(/\{\{[\s\S]*?\}\}/g, '1');
  }
  return JSON.parse(texto) as Record<string, unknown>;
}

function nodosDeSalida(archivo: string): Nodo[] {
  const wf = JSON.parse(readFileSync(join(CARPETA, archivo), 'utf8')) as { nodes?: Nodo[] };
  return (wf.nodes ?? []).filter((nodo) => {
    const p = nodo.parameters ?? {};
    return typeof p.url === 'string' && p.url.includes('/v1/tools/');
  });
}

function nodosConCuerpo(archivo: string): Nodo[] {
  return nodosDeSalida(archivo).filter(
    (nodo) => typeof (nodo.parameters ?? {}).jsonBody === 'string'
  );
}

const archivos = readdirSync(CARPETA).filter((archivo) => archivo.endsWith('.json'));
// Solo los flujos que mandan algo: los demas no tienen nada que comprobar aqui.
const conCuerpo = archivos.filter((archivo) => nodosConCuerpo(archivo).length > 0);

describe('cuerpos de salida de los flujos', () => {
  it('encuentra los flujos y sus nodos de salida', () => {
    // Si la carpeta o el formato cambian, esto avisa en lugar de dejar pasar una comprobacion vacia.
    const total = conCuerpo.reduce((suma, archivo) => suma + nodosConCuerpo(archivo).length, 0);
    expect(archivos.length).toBeGreaterThan(0);
    expect(conCuerpo.length).toBeGreaterThan(3);
    expect(total).toBeGreaterThan(20);
  });

  it.each(conCuerpo)('%s: cada cuerpo dirigido a nuestra API se interpreta', (archivo) => {
    const nodos = nodosConCuerpo(archivo);
    for (const nodo of nodos) {
      const p = nodo.parameters ?? {};
      let interpretado: Record<string, unknown>;
      try {
        interpretado = interpretarCuerpo(String(p.jsonBody));
      } catch (error) {
        throw new Error(
          nodo.name + ': n8n no podria interpretar este cuerpo (' + String(error) + ')'
        );
      }
      // Una clave presente pero vacia dejaria el envio sin proteccion: el esquema la rechaza.
      if ('idempotencyKey' in interpretado) {
        expect(String(interpretado.idempotencyKey).length, nodo.name).toBeGreaterThan(0);
      }
    }
    expect(nodos.length).toBeGreaterThan(0);
  });
});
