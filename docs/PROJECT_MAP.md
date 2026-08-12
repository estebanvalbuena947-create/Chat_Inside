# Mapa del proyecto

## Propósito

`[DESCRIBIR EN DOS O TRES FRASES QUÉ HACE EL SISTEMA Y PARA QUIÉN]`

## Actores

- `[ACTOR_1]`: `[RESPONSABILIDAD]`
- `[ACTOR_2]`: `[RESPONSABILIDAD]`
- `[SISTEMA_EXTERNO]`: `[INTERACCIÓN]`

## Dominios centrales

### `[DOMINIO_1]`

- Es propietario de: `[REGLAS]`
- No es propietario de: `[REGLAS QUE PERTENECEN A OTRO DOMINIO]`
- Punto de entrada: `[RUTA/MÓDULO]`
- Pruebas principales: `[RUTA]`

### `[DOMINIO_2]`

- Es propietario de: `[REGLAS]`
- No es propietario de: `[REGLAS AJENAS]`
- Punto de entrada: `[RUTA/MÓDULO]`
- Pruebas principales: `[RUTA]`

## Flujos de alto nivel

1. `[ORIGEN]` envía `[EVENTO/SOLICITUD]`.
2. `[ADAPTADOR]` valida y normaliza.
3. `[SERVICIO DE APLICACIÓN]` coordina.
4. `[DOMINIO]` aplica reglas.
5. `[REPOSITORIO/INTEGRACIÓN]` persiste o ejecuta el efecto.
6. `[RESPUESTA/EVENTO]` comunica el resultado.

## Dónde implementar cada cambio

| Tipo de cambio | Propietario | Ubicación |
|---|---|---|
| Regla de negocio | Dominio | `[RUTA]` |
| Coordinación de caso de uso | Aplicación | `[RUTA]` |
| HTTP/webhook/API externa | Adaptadores | `[RUTA]` |
| Persistencia | Infraestructura | `[RUTA]` |
| Presentación | UI | `[RUTA]` |

## Cómo verificar

- Pruebas: `[COMANDO]`
- Lint: `[COMANDO]`
- Tipos: `[COMANDO]`
- Build: `[COMANDO]`
- Prueba manual crítica: `[PASOS]`
