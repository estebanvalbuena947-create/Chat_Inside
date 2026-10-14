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

type Nodo = { name: string; type?: string; parameters?: Record<string, unknown> };

/**
 * La forma anidada de n8n: por cada nodo, por cada tipo de conexion (`main`, `ai_tool`, …), una
 * lista de salidas y, dentro de cada salida, los destinos.
 */
type Flujo = {
  nodes?: Nodo[];
  connections?: Record<string, Record<string, Array<Array<{ node: string }>>>>;
};

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

/**
 * Las interpolaciones que viven dentro del miembro `text` de un cuerpo que es texto JSON.
 *
 * `text` es el unico miembro del contrato que lleva contenido arbitrario: lo que escribio el agente.
 * Los identificadores (`conversationId`, `idempotencyKey`) los generamos nosotros y no pueden romper
 * el JSON, asi que no entran aqui.
 */
function interpolacionesDeTexto(cuerpo: string): string[] {
  const texto = cuerpo.startsWith('=') ? cuerpo.slice(1) : cuerpo;
  if (texto.trim().startsWith('{{')) return [];
  const encontradas: string[] = [];
  const miembros = /"text"\s*:\s*"([^"]*)"/g;
  let coincidencia: RegExpExecArray | null;
  while ((coincidencia = miembros.exec(texto)) !== null) {
    for (const interpolacion of coincidencia[1].match(/\{\{[\s\S]*?\}\}/g) ?? []) {
      encontradas.push(interpolacion.trim());
    }
  }
  return encontradas;
}

/** El patron que exigimos en los flujos, para poder comprobarlo aqui tal cual. */
function escaparParaJson(valor: unknown): string {
  return JSON.stringify(String(valor ?? '')).slice(1, -1);
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

  it.each(conCuerpo)('%s: el contenido de `text` entra escapado', (archivo) => {
    // Un texto crudo dentro de una cadena JSON la rompe en cuanto trae un salto de linea, una
    // comilla o una barra invertida, y n8n falla antes de mandar nada. Con ManyChat no pasaba
    // porque el texto no viajaba en el cuerpo. Aqui se exige el escape por construccion.
    const pendientes: string[] = [];
    for (const nodo of nodosConCuerpo(archivo)) {
      for (const interpolacion of interpolacionesDeTexto(String(nodo.parameters?.jsonBody))) {
        if (!interpolacion.startsWith('{{ JSON.stringify(')) {
          pendientes.push(nodo.name + ' :: ' + interpolacion);
        }
      }
    }
    expect(pendientes, 'texto sin escapar: ' + pendientes.join(' | ')).toEqual([]);
  });
});

describe('el patron de escape de los textos', () => {
  it('aguanta saltos, comillas, barras, vacios y numeros', () => {
    // Se comprueba el patron que exigen los flujos, no una copia de su implementacion: si alguien lo
    // cambia por uno que no escape, o que pierda los numeros, esto lo dice.
    const hostil = 'Linea 1\nLinea "2"\\ y tabulador\t';
    const cuerpo = `{\n  "text": "${escaparParaJson(hostil)}\\n\\n${escaparParaJson('segunda')}"\n}`;

    expect(JSON.parse(cuerpo)).toEqual({ text: `${hostil}\n\nsegunda` });
    expect(JSON.parse(`{"text":"${escaparParaJson(undefined)}"}`)).toEqual({ text: '' });
    expect(JSON.parse(`{"text":"${escaparParaJson(null)}"}`)).toEqual({ text: '' });
    // Un numero no puede perder sus digitos: JSON.stringify devuelve `7` sin comillas.
    expect(JSON.parse(`{"text":"${escaparParaJson(7)}"}`)).toEqual({ text: '7' });
  });
});

/**
 * La forma de los flujos. Un flujo puede tener los cuerpos perfectos y no enviar nada: basta con
 * que el nodo que envia se pierda o deje de ser un POST.
 *
 * Paso en produccion. El recordatorio de 4.1 termino en `RECORDATORIO_PAGO_1H_ERROR` con
 * `operacion_http_status: 0`: el nodo llamado `Recordatorio - enviar mensaje` era un **IF** y en ese
 * tramo no habia ninguna llamada a `/v1/tools/messages`, asi que el verificador leyo la salida del
 * IF —sin `statusCode`— en lugar de la respuesta de un envio. La conversacion se leyo bien y el
 * mensaje nunca salio.
 *
 * Estas pruebas miran el grafo, no el texto: que el envio exista y sea un POST, que quien verifica
 * lo reciba de ese POST, que nadie repita nombre (n8n pierde uno al importar) y que ningun nodo
 * quede aislado.
 */
describe('estructura de los flujos', () => {
  const leerFlujo = (archivo: string): Flujo =>
    JSON.parse(readFileSync(join(CARPETA, archivo), 'utf8')) as Flujo;

  const aristas = (flujo: Flujo): Array<[string, string]> => {
    const pares: Array<[string, string]> = [];
    for (const [origen, salidas] of Object.entries(flujo.connections ?? {})) {
      for (const ramas of Object.values(salidas)) {
        for (const rama of ramas) {
          for (const enlace of rama) pares.push([origen, enlace.node]);
        }
      }
    }
    return pares;
  };

  /** Los nodos que mandan algo a nuestra API de mensajes. */
  const envios = (flujo: Flujo): Nodo[] =>
    (flujo.nodes ?? []).filter((nodo) =>
      String(nodo.parameters?.url ?? '').includes('/v1/tools/messages')
    );

  const codigos = (flujo: Flujo): Nodo[] =>
    (flujo.nodes ?? []).filter((nodo) => typeof nodo.parameters?.jsCode === 'string');

  /** Un verificador: el nodo que decide si el envio salio bien a partir de la respuesta. */
  const verificadores = (flujo: Flujo): Nodo[] =>
    codigos(flujo).filter((nodo) => String(nodo.parameters?.jsCode).includes('operacion_ok'));

  it('lee todos los flujos y encuentra sus envios', () => {
    // Si la carpeta o el formato cambian, esto avisa en lugar de dejar pasar comprobaciones vacias.
    expect(archivos.length).toBeGreaterThan(3);
    const conEnvios = archivos.filter((archivo) => envios(leerFlujo(archivo)).length > 0);
    expect(conEnvios.length).toBeGreaterThan(3);
  });

  it.each(archivos)('%s: ningun nodo comparte nombre con otro', (archivo) => {
    // n8n no admite dos nodos con el mismo nombre y, al importar, se queda con uno sin avisar. Si el
    // que se pierde es el que envia, la cadena salta del IF al verificador y no sale ningun mensaje.
    const nombres = (leerFlujo(archivo).nodes ?? []).map((nodo) => nodo.name);
    const repetidos = nombres.filter((nombre, indice) => nombres.indexOf(nombre) !== indice);
    expect([...new Set(repetidos)], 'nombres repetidos en ' + archivo).toEqual([]);
  });

  it.each(archivos)('%s: cada nodo de envio es un POST a nuestra API', (archivo) => {
    const flujo = leerFlujo(archivo);
    for (const nodo of envios(flujo)) {
      // `httpRequestTool` es el mismo nodo HTTP cuando lo usa un agente: tambien envia de verdad.
      expect(String(nodo.type), nodo.name + ' no es un nodo HTTP').toMatch(/httpRequest/);
      expect(nodo.parameters?.method, nodo.name + ' no usa POST').toBe('POST');
      expect(String(nodo.parameters?.jsonBody ?? ''), nodo.name + ' no lleva cuerpo').not.toBe('');
    }
  });

  it.each(archivos)('%s: quien promete enviar un mensaje lo envia de verdad', (archivo) => {
    const flujo = leerFlujo(archivo);
    const prometen = (flujo.nodes ?? []).filter((nodo) => /(^|\s)enviar mensaje$/i.test(nodo.name));
    for (const nodo of prometen) {
      expect(
        envios(flujo).map((envio) => envio.name),
        nodo.name
      ).toContain(nodo.name);
    }
  });

  it.each(archivos)('%s: quien verifica un envio lo recibe de un POST', (archivo) => {
    // El verificador publica `operacion_ok` leyendo `item.status` de la respuesta. Si su entrada es
    // un IF o un code, no hay `statusCode` que leer y el flujo reporta un fallo que nunca ocurrio.
    const flujo = leerFlujo(archivo);
    const porNombre = new Map((flujo.nodes ?? []).map((nodo) => [nodo.name, nodo]));
    const pares = aristas(flujo);
    for (const verificador of verificadores(flujo)) {
      const entradas = pares
        .filter(([, destino]) => destino === verificador.name)
        .map(([origen]) => origen);
      expect(entradas.length, verificador.name + ' no recibe nada').toBeGreaterThan(0);
      for (const origen of entradas) {
        const fuente = porNombre.get(origen);
        const url = String(fuente?.parameters?.url ?? '');
        expect(
          url,
          verificador.name + ' verifica a ' + origen + ', que no envia mensajes'
        ).toContain('/v1/tools/messages');
      }
    }
  });

  it.each(archivos)('%s: ningun nodo queda aislado', (archivo) => {
    // Un bloque entero puede quedar sin conexion al reescribir a mano —ya paso con la conversion de
    // 4.2—: se ve en el lienzo, no en los cuerpos. Se recorre el grafo sin importar el tipo de
    // conexion, porque las tools y los sub-nodos de IA apuntan hacia su agente.
    const flujo = leerFlujo(archivo);
    const vecinos = new Map<string, Set<string>>();
    const unir = (a: string, b: string) => {
      if (!vecinos.has(a)) vecinos.set(a, new Set());
      if (!vecinos.has(b)) vecinos.set(b, new Set());
      vecinos.get(a)?.add(b);
      vecinos.get(b)?.add(a);
    };
    for (const [origen, destino] of aristas(flujo)) unir(origen, destino);

    const ENTRADAS = [
      'executeWorkflowTrigger',
      'manualTrigger',
      'scheduleTrigger',
      'stripeTrigger',
      'webhook'
    ];
    const cola = (flujo.nodes ?? [])
      .filter((nodo) => ENTRADAS.includes(String(nodo.type).split('.').pop() ?? ''))
      .map((nodo) => nodo.name);
    const vistas = new Set<string>();
    while (cola.length) {
      const actual = cola.pop() as string;
      if (vistas.has(actual)) continue;
      vistas.add(actual);
      for (const vecino of vecinos.get(actual) ?? []) if (!vistas.has(vecino)) cola.push(vecino);
    }

    const sueltos = (flujo.nodes ?? [])
      .filter((nodo) => nodo.type !== 'n8n-nodes-base.stickyNote' && !vistas.has(nodo.name))
      .map((nodo) => nodo.name);
    expect(sueltos, 'nodos sin conexion en ' + archivo).toEqual([]);
  });

  /**
   * Un flujo migrado es el que ya resuelve la identidad de la conversacion con nuestro id: publica
   * `weplash_ruta_valida` (y, cuando ademas verifica el envio, `operacion_ok`). El puente de 4.2
   * —ManyChat mientras el id sea del proveedor anterior— tambien entra aqui: lo que se vigila es que
   * su camino nuestro no dependa del proveedor, no que el proveedor desaparezca del archivo.
   */
  const migrados = archivos.filter((archivo) =>
    (leerFlujo(archivo).nodes ?? []).some(
      (nodo) =>
        typeof nodo.parameters?.jsCode === 'string' &&
        (String(nodo.parameters.jsCode).includes('weplash_ruta_valida') ||
          String(nodo.parameters.jsCode).includes('operacion_ok'))
    )
  );

  it('los flujos migrados no escriben campos del contacto como transporte', () => {
    expect(migrados.length, 'ningun flujo migrado: la regla pasaria en vacio').toBeGreaterThan(0);
    for (const archivo of migrados) {
      const flujo = leerFlujo(archivo);
      const ejecutable = JSON.stringify({ nodes: flujo.nodes, connections: flujo.connections });
      expect(ejecutable, archivo + ' conserva ' + '/v1/tools/contact-fields').not.toContain(
        '/v1/tools/contact-fields'
      );
    }
  });

  it('los flujos migrados no identifican la conversacion con el id del proveedor anterior', () => {
    // `subscriber_id` es del proveedor anterior y es numerico. Nuestros extremos resuelven la
    // conversacion por su id, que es un UUID, y responden 404/422 con cualquier otra forma. Un flujo
    // migrado no lo manda: resuelve el id de la conversacion y, si no lo es, lo reporta.
    expect(migrados.length, 'ningun flujo migrado: la regla pasaria en vacio').toBeGreaterThan(0);

    for (const archivo of migrados) {
      const llamadas = (leerFlujo(archivo).nodes ?? []).filter((nodo) =>
        String(nodo.parameters?.url ?? '').includes('/v1/tools/')
      );
      expect(llamadas.length, archivo + ' no llama a nuestra API').toBeGreaterThan(0);
      for (const nodo of llamadas) {
        const crudo = JSON.stringify(nodo.parameters);
        expect(
          crudo,
          archivo + ' › ' + nodo.name + ' usa subscriber_id contra nuestra API'
        ).not.toContain('subscriber_id');
        // El camino nuestro no puede depender de la cuenta del proveedor anterior.
        for (const aguja of ['manychat_account_id', 'manychat_channel', 'fb1309803', 'fb1346079']) {
          expect(crudo, archivo + ' › ' + nodo.name + ' depende de ' + aguja).not.toContain(aguja);
        }
      }
    }
  });

  it('el proveedor anterior solo se usa por la rama que reconoce su identificador', () => {
    // Un flujo puede seguir enviando por ManyChat mientras el borrador traiga su id (numerico). Lo que
    // no puede es usar ese transporte sin haber clasificado antes el identificador: si la llamada al
    // proveedor anterior no cuelga de esa rama, un id de conversacion acabaria enviado por el canal
    // equivocado —o fallando— sin que nadie lo note.
    const conProveedor = archivos.filter((archivo) =>
      (leerFlujo(archivo).nodes ?? []).some((nodo) =>
        String(nodo.parameters?.url ?? '').includes('api.manychat.com')
      )
    );
    expect(conProveedor.length, 'ningun flujo usa el proveedor anterior').toBeGreaterThan(0);

    for (const archivo of conProveedor) {
      const flujo = leerFlujo(archivo);
      const pares = aristas(flujo);
      const clasificadores = new Set(
        (flujo.nodes ?? [])
          .filter(
            (nodo) =>
              typeof nodo.parameters?.jsCode === 'string' &&
              String(nodo.parameters.jsCode).includes('destino_mensajeria')
          )
          .map((nodo) => nodo.name)
      );
      expect(
        clasificadores.size,
        archivo + ' usa el proveedor anterior sin clasificar el identificador'
      ).toBeGreaterThan(0);

      const ancestros = new Map<string, Set<string>>();
      for (const [origen, destino] of pares) {
        if (!ancestros.has(destino)) ancestros.set(destino, new Set());
        ancestros.get(destino)?.add(origen);
      }

      for (const nodo of (flujo.nodes ?? []).filter((n) =>
        String(n.parameters?.url ?? '').includes('api.manychat.com')
      )) {
        const vistos = new Set<string>();
        const cola = [...(ancestros.get(nodo.name) ?? [])];
        while (cola.length) {
          const actual = cola.pop() as string;
          if (vistos.has(actual)) continue;
          vistos.add(actual);
          for (const padre of ancestros.get(actual) ?? []) cola.push(padre);
        }
        const tieneClasificador = [...clasificadores].some((nombre) => vistos.has(nombre));
        expect(
          tieneClasificador,
          archivo + ' › ' + nodo.name + ' llama al proveedor anterior fuera de su rama'
        ).toBe(true);
      }
    }
  });
});
