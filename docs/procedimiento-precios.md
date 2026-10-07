# Procedimiento: sembrar los precios

Los importes que el bot cobra viven hoy en el prompt del agente y en la hoja de catálogo. Este
documento los lleva a la tabla `branch_services`, para que **cambiar un precio sea editar una fila**
y no abrir un flujo de doscientos nodos.

La fuente es [`prompt-sara-servicios-precios.md`](./prompt-sara-servicios-precios.md), extraído de la
sección 5 del prompt maestro.

## Antes de empezar

Hace falta la migración `20261006180000_add_branch_services.sql` aplicada. Sin ella la tabla no
existe y nada de esto funciona.

Y las sedes dadas de alta: `valle`, `lomas`, `juarez`, `polanco`.

## Los cinco conceptos y su unidad

La unidad **no es un detalle de presentación**: el precio de Tribu es **por persona** y el de Pareja
es **en total**. Sin esa distinción el bot diría «$999 por persona» cuando son tres, o «$1.998» a
cada uno de una pareja.

| Código              | Nombre            | Importe | Unidad       |
| ------------------- | ----------------- | ------- | ------------ |
| `anticipo`          | Anticipo          | 500.00  | `total`      |
| `individual`        | Individual        | 1099.00 | `total`      |
| `pareja`            | Pareja            | 1998.00 | `total`      |
| `tribu`             | Tribu (3 o más)   | 999.00  | `per_person` |
| `pastel_individual` | Pastel individual | 499.00  | `total`      |

El **anticipo** se separa del resto a propósito: no es una tarifa, es un **plazo de pago** (sección
2.6.3 del prompt). Se siembra igual porque el bot necesita poder decir su importe, pero no debería
tratarse como una experiencia.

## El SQL

Se ejecuta en el SQL Editor. Es idempotente: repetirlo actualiza los importes en lugar de duplicar
las filas.

```sql
-- Los cinco conceptos en cada sede activa del espacio.
insert into public.branch_services (tenant_id, branch_id, code, name, price, price_unit, currency, sort_order)
select
  b.tenant_id,
  b.id,
  v.code,
  v.name,
  v.price,
  v.unit,
  'MXN',
  v.orden
from public.branches b
cross join (values
  ('anticipo',          'Anticipo',          500.00,  'total',      1),
  ('individual',        'Individual',       1099.00,  'total',      2),
  ('pareja',            'Pareja',           1998.00,  'total',      3),
  ('tribu',             'Tribu (3 o mas)',   999.00,  'per_person', 4),
  ('pastel_individual', 'Pastel individual', 499.00,  'total',      5)
) as v(code, name, price, unit, orden)
where b.is_active
on conflict (branch_id, code) do update set
  price = excluded.price,
  price_unit = excluded.price_unit,
  name = excluded.name,
  sort_order = excluded.sort_order,
  updated_at = now();
```

El `on conflict` nombra las **columnas**, que es como Postgres resuelve el conflicto, no el índice. El
único de la tabla se llama `branch_services_branch_code_idx`, y el bloque funciona tal cual.

## Comprobarlo

Lo que ve el bot, con su credencial de máquina:

```bash
curl -s -H "Authorization: Bearer TU_TOKEN_DE_MAQUINA" \
  "https://apichat.insidespa.com.mx/v1/tools/branches/polanco/services"
```

Debe devolver los cinco, cada uno con `price` y `priceUnit` **por separado** — nunca una cadena
formateada: quien formatea es quien muestra, no quien guarda.

## Después de sembrar

Queda **retirar los importes del prompt**, que es lo que hace que actualizarlos no exija editar el
flujo:

1. La **sección 5** del prompt maestro (`docs/prompt-maestro-sara.md`, líneas 519 a 837).
2. La línea **636**, con la tabla de formato obligatorio. Está dentro de la sección 5.
3. La línea **2159**, dentro de una respuesta de ejemplo.
4. La línea **2256**, en «Lenguaje para comparar experiencias».
5. Y la línea **2156**, que no cita un importe suelto sino una **regla**: _«Los $1,998 MXN del prompt
   corresponden a Premium Day Spa pareja; no se trasladan a un masaje genérico»_. Esa hay que
   **reescribirla** para que hable de la experiencia en lugar del importe, no borrar el número y
   dejar la frase coja.

Las cinco están localizadas con su número de línea. Las cuatro primeras se sustituyen; la quinta se
reescribe.

En su lugar, el agente debe **consultar `GET /v1/tools/branches/{sede}/services`**. Mientras el
prompt siga llevando los importes escritos, un cambio de precio en la tabla **no** llegará al
cliente por esos caminos.
