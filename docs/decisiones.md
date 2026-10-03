# Decisiones de diseño (ADR resumidos)

Anotaciones cortas de por qué elegimos cada camino. Para el detalle operacional ver `README.md`.

## ADR-001: Periodo como `DATE`, no `VARCHAR`

`ventas.periodo` es `date NOT NULL CHECK (EXTRACT(DAY FROM periodo) = 1)`. Así:

- Filtra con `<=`, `>=` sin pensar al locale.
- El parser de `pg` para `DATE` devuelve texto ISO directo (sin corrida de día por zona horaria).
- `to_char(periodo, 'YYYY-MM')` produce la clave de serie sin riesgo de drift.

Costo: el pipeline tiene que normalizar las 6 variantes que traía el Excel (`2026.01`, `2026/05`, `2026 06`, ...).

## ADR-002: Cliente con un solo asesor (llave = cod_cliente)

`cliente_asesor` tiene `PRIMARY KEY (cod_cliente)`, no `(cod_cliente, cod_asesor)`. Razón: la base dice 1 asesor por cliente (11 288 filas). Si permitiéramos varios, una venta podría duplicarse al cruzar contra sedes. El test `ventas se duplican` lo verifica con 2 inserts del mismo grano esperando 3 filas, no 6.

## ADR-003: `es_nota_credito` como columna generada

`GENERATED ALWAYS AS (neto < 0) STORED`. La definición de "nota crédito" vive en un solo lugar (Postgres la calcula). El código nunca decide; lee.

## ADR-004: Sin tests unitarios por librería

Elegimos `node:test` nativo (sin Jest/Vitest) y centralizamos las pruebas en `tests/api.test.mjs` (integración contra `next start` + Postgres con datos sembrados en periodo 2090).

Resultado: cobertura real del pipeline HTTP + DB, sin vela en `variacion()`, `proyectar()` o `moverPeriodo()`. Contrapartida: `tests/unit.test.mjs` cubre funciones puras y parsers sin levantar el servidor.

## ADR-005: Rate limit en memoria

Documentado en `docs/seguridad.md`. Aceptamos la limitación para correr en una sola instancia; el proxy lleva una nota con el upgrade path a Redis/Upstash.

## ADR-006: OpenAPI 3.1 escrito a mano

`lib/api/openapi.ts` declara el contrato a mano, sin generadores. Son 6 endpoints y los filtros son los mismos; escribirlo a mano es menos código y menos dependencias que `zod-to-openapi`.

## ADR-007: Tres scripts de npm para tests

- `pnpm test` -> corre todo (`tests/*.test.mjs`), incluyendo unit + integración.
- `pnpm test:unit` -> solo `tests/unit.test.mjs` (rápido, sin DB).
- `pnpm test:integration` -> solo `tests/api.test.mjs` (necesita Postgres levantado).

El script `test` usa `--experimental-transform-types` para importar `.ts` directamente desde `.mjs`.

## ADR-008: CSP desactivada en el proxy

La rama Back solo expone JSON. La CSP se define en la rama UI con `nonce` para los scripts de Next. Marcado en `proxy.ts:6`.