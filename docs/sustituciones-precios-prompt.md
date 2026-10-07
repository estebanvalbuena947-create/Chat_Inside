# Precios del prompt: las cuatro sustituciones, listas para pegar

Una vez sembrada `branch_services`, quedan **cuatro sitios** del prompt maestro con los importes
escritos a mano. Este documento tiene el texto exacto de cada uno y lo que debe poner en su lugar.

Fuente del mapa: [`procedimiento-precios.md`](./procedimiento-precios.md).

## Antes de tocar nada: el prompt no puede consultar la base

Al redactar la primera sustitución me topé con esto, y cambia el enfoque.

El prompt es el **mensaje de sistema** de un nodo de agente: un texto. **No puede llamar a ninguna
herramienta.** Las herramientas las llama el **flujo**, y las mete en el prompt como variables —
que es exactamente lo que ya hace con todo lo demás:

```
{{ $('Fusionar estado de reserva1').first().json.booking_state?.estado }}
{{ JSON.stringify($('Fusionar estado de reserva1').first().json.faltantes || []) }}
```

Así que el trabajo no es «sustituir el número por una consulta», sino:

1. **Un nodo nuevo** entre la consulta de la sede y el agente, que llame a
   `GET /v1/tools/branches/{sede}/services` y dé formato a la lista.
2. **El prompt**, que pasa a usar esa variable donde antes tenía los importes.

El nodo es tuyo, en n8n. Las cuatro sustituciones de abajo son mías.

---

## 1. La sección 5 entera — líneas 519 a 837

Es el bloque grande: las cuatro experiencias, sus modalidades y sus precios.

**Antes**: 319 líneas con los importes escritos.

**Después**:

```
## 5. Experiencias principales y precios autorizados

{{ $('Precios de la sede').first().json.lista }}

Usa ÚNICAMENTE los importes que figuran arriba. No los cites de memoria ni los deduzcas: cambian sin
aviso, y esta lista es la vigente en este turno.

Para cualquier cálculo (por persona, en total, con descuento), apóyate en esa lista y no en lo que
recuerdes de conversaciones anteriores.
```

El nodo `Precios de la sede` debe producir un texto con el mismo aspecto que las 319 líneas que
sustituye: nombre de la experiencia, qué incluye, y las tres modalidades con su importe y su unidad.

## 2. La línea 636 — la tabla de formato obligatorio

**Antes**:

```
Individual: $1,099 | Pareja: $1,998 | Tribu: $999 por persona (desde 3 personas).
```

**Después**:

```
Individual: {{ $('Precios de la sede').first().json.individual }} | Pareja: {{ $('Precios de la sede').first().json.pareja }} | Tribu: {{ $('Precios de la sede').first().json.tribu }} por persona (desde 3 personas).
```

## 3. La línea 2159 — la respuesta de ejemplo

**Antes** (el final de la frase):

```
… con tabla de quesos y copa de vino de cortesía, por $1,998 MXN en total.
```

**Después**:

```
… con tabla de quesos y copa de vino de cortesía, por {{ $('Precios de la sede').first().json.pareja }} en total.
```

**Esta es la más importante de las cuatro**: no es una mención en un comentario, es **el texto que el
bot le manda al cliente**. Sin cambiarla, el precio de Pareja se actualizaría en la tabla y el bot
seguiría diciendo la cifra vieja en esa respuesta.

## 4. La línea 2256 — lenguaje para comparar experiencias

**Antes**:

```
· Premium Day Spa: individual $1,099 · pareja $1,998 · tribu $999 por persona (3 o más).
```

**Después**:

```
· Premium Day Spa: individual {{ $('Precios de la sede').first().json.individual }} · pareja {{ $('Precios de la sede').first().json.pareja }} · tribu {{ $('Precios de la sede').first().json.tribu }} por persona (3 o más).
```

## 5. La línea 2156 — la regla que hay que reescribir

**Antes**:

```
Los $1,998 MXN del prompt corresponden a Premium Day Spa pareja; no se trasladan a un masaje genérico ni a Pr…
```

**Después**:

```
El importe de pareja es el de Premium Day Spa pareja; no se traslada a un masaje genérico ni a
ninguna otra experiencia.
```

**Aquí no se sustituye un número: se quita.** La regla —«este precio pertenece a esta experiencia y
no se mueve»— sigue siendo válida y necesaria; lo que sobra es la cifra. Si se borra el importe y se
deja la frase como estaba, queda una regla que habla de un número que ya no está.

---

## Lo que no se toca

**El anticipo de 500 no sale del prompt.** Aparece en la sección 2.6.3 y en las plantillas de pago,
y describe un **plazo**: cuándo hay que pagar y qué pasa si no se paga. Eso es una regla de proceso,
no una tarifa — y las reglas de proceso viven donde se deciden, no en una tabla de precios.

Los dos importes conviven sin problema: la tabla guarda lo que el bot **cobra**, y el prompt explica
**cuándo** hay que cobrarlo.

---

## 6. Los dos nodos de código del flujo de Sara

No están en el prompt: son nodos del flujo `Sara IG ISV`, y también llevan importes escritos. Quedan
fuera del texto, pero dentro del mismo problema — mientras los tengan, cambiar un precio en la tabla
**no llega a lo que el bot responde**.

Necesitan lo mismo que el prompt: una variable con los precios, que pone el nodo nuevo.

Y una precisión que importa: **en un nodo de código la variable se escribe `${…}`, no `{{…}}`**. En
el prompt es una plantilla de n8n; en el código es JavaScript. Confundirlos no da error de sintaxis
en n8n: da un mensaje con las llaves a la vista del cliente.

### 6.1 `Preparar estado conversacion1` — la propuesta de Premium Day Spa

Es un nodo de 563 líneas. La parte que importa:

**Antes**

```js
const precio =
  n === 1
    ? '$1,099 MXN.'
    : n === 2
      ? '$1,998 MXN en total para dos personas.'
      : n >= 3
        ? '$999 MXN por persona.'
        : '';
```

**Después**

```js
const p = $json.precios; // lo pone el nodo que consulta la herramienta
const precio =
  n === 1
    ? `${p.individual} MXN.`
    : n === 2
      ? `${p.pareja} MXN en total para dos personas.`
      : n >= 3
        ? `${p.tribu} MXN por persona.`
        : '';
```

**Sin valor por defecto a propósito.** Un `?? '$1,099'` haría que el flujo siguiera funcionando con
una cifra inventada cuando el nodo de precios fallara. Es mejor que la ejecución se caiga: un error
visible durante una prueba, en lugar de un precio equivocado delante de un cliente.

### 6.2 `Respuesta fija pareja1` — el catálogo copiado

50 líneas: el catálogo de las cuatro experiencias con sus importes dentro, terminando en
`Pareja: $1,998.`

**Antes**

```
🌿 **Premium Day Spa**
50 min de masaje relajante + mascarilla facial hidratante.
Cortesía: tabla de quesos + copa de vino.
Pareja: $1,998.
```

**Después**

```js
const p = $json.precios;
// …el mismo texto, con la única línea que llevaba el importe cambiada:
`Pareja: ${p.pareja}.`;
```

Esta plantilla es **la misma información que la sección 5.1 del prompt**, en otro sitio. Cuando se
sustituyan las dos, conviene comprobar que dicen lo mismo: dos copias del catálogo que se actualizan
por separado acaban discrepando.
