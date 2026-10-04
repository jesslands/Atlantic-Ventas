# Atlantic Ventas — API

API de cifras de venta sobre **PostgreSQL**, construida con Next.js 16 (App Router).
La rama `Back` contiene el backend completo: pipeline de limpieza, esquema de base
de datos, endpoints REST documentados con OpenAPI y pruebas.

El punto de partida es `investigacion/Base.xlsx`, un Excel sucio. Todo lo que se
sabe de ese archivo está documentado en [`investigacion/DATA_QUALITY.md`](investigacion/DATA_QUALITY.md).

---

## Arranque rápido

```bash
cp .env.example .env          # credenciales (valores por defecto de compose)
docker compose up -d db       # Postgres
pnpm install
pnpm ingest                   # Excel sucio -> base limpia (~25 s, 446 742 ventas)
pnpm dev                      # http://localhost:3000/api/docs
```

Producción completa (base + API en contenedores):

```bash
docker compose up -d --build
# API en :3000 (o en $APP_PORT), Postgres en :5432, datos en el volumen pgdata
docker compose exec app node pipeline/limpieza.mjs   # cargar el Excel dentro del contenedor
```

| Comando            | Qué hace                                              |
|--------------------|-------------------------------------------------------|
| `pnpm dev`         | API + UI en modo desarrollo                          |
| `pnpm ingest`      | limpia el Excel y lo carga (upsert) en Postgres      |
| `pnpm test`        | 22 pruebas (unit + integración) contra el API real   |
| `pnpm test:unit`   | solo unit, sin DB                                     |
| `pnpm test:integration` | solo integración, requiere Postgres             |
| `pnpm migrate`     | aplica migraciones pendientes de `db/migrations/`     |
| `pnpm build`       | build de producción                                  |
| `pnpm typecheck`   | `tsc --noEmit`                                       |
| `pnpm lint`        | eslint                                               |

Variables de entorno (`.env.example`, ninguna con secretos reales):

| Variable          | Por defecto                          | Para qué                          |
|-------------------|--------------------------------------|-----------------------------------|
| `DATABASE_URL`    | `postgres://atlantic:atlantic@localhost:5432/atlantic` | Conexión a Postgres (compose la sobrescribe con el host `db`) |
| `DB_POOL_MAX`     | `10`                                 | Conexiones máximas del pool       |
| `RATE_LIMIT_MAX`  | `120`                                | Peticiones/minuto/identidad en `/api` |
| `TRUST_PROXY`     | `false`                              | `true` solo si hay un proxy reverso de confianza delante (ver [Seguridad](#seguridad)) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `atlantic` / `atlantic` / `atlantic` / `5432` | Credenciales de la base;compose las arma en `DATABASE_URL` |
| `APP_PORT`        | `3000`                               | Puerto del API en el host          |

---

## Documentación de la API

**Swagger UI en `/api/docs`** (interactivo) y el contrato OpenAPI 3.1 en
`/api/docs/openapi.json`. Todos los endpoints de cifras aceptan los mismos
filtros opcionales:

| Filtro   | Formato                       | Notas                                        |
|----------|-------------------------------|----------------------------------------------|
| `desde`  | `YYYY-MM`                     | Periodo inicial, inclusive; se compara contra el DATE `2026-01-01` |
| `hasta`  | `YYYY-MM`                     | Periodo final, inclusive                     |
| `sede`   | `BOGOTA,CALI`                 | Repetible o separado por coma; sin distinguir mayúsculas |
| `asesor` | `ASE-004`                     | Repetible o separado por coma                |

| Endpoint                | Devuelve                                                                              |
|-------------------------|---------------------------------------------------------------------------------------|
| `GET /kpis`             | Venta neta y bruta, transacciones, clientes activos, ticket promedio, notas crédito, ceros, atípicos (>$1M), % devoluciones y variación contra el mes anterior |
| `GET /ventas/tendencia` | Serie mensual real (neto, ventas, notas, clientes, ticket mediano) + proyección por regresión lineal hasta diciembre |
| `GET /ventas/sedes`     | Venta, clientes y participación por sede                                              |
| `GET /asesores/ranking` | Ranking por venta neta con clientes, ticket medio y variación (`?limite=`, máx. 100)  |
| `GET /asesores/{codigo}`| Ficha del asesor: serie mensual y top 10 clientes por neto                           |
| `GET /clientes`         | Listado paginado con búsqueda (`?q=`), ordenamiento (`?orden=`, `?dir=`) y filtros (tope `pagina` 2.000) |
| `GET /clientes/{codigo}`| Ficha del cliente: serie mensual, top 8 materiales y primera/última compra            |

Ejemplos:

```bash
curl 'http://localhost:3000/api/kpis?desde=2026-01&hasta=2026-06&sede=BOGOTA'
curl 'http://localhost:3000/api/ventas/tendencia?sede=CALI,PEREIRA'
curl 'http://localhost:3000/api/clientes?q=alameda&orden=ultimaCompra&porPagina=20'
curl 'http://localhost:3000/api/clientes/1000001'
```

### Errores

Una sola forma para todos:

```json
{ "error": { "codigo": "PARAMETROS_INVALIDOS", "mensaje": "...", "detalles": { "desde": "2026-13" } } }
```

| Estado | `codigo`               | Cuándo                                          |
|--------|------------------------|-------------------------------------------------|
| 400    | `PARAMETROS_INVALIDOS` | Periodo malformed, orden desconocido, `desde > hasta`, código no numérico, `porPagina > 100` |
| 404    | `NO_ENCONTRADO`        | Cliente inexistente                              |
| 429    | `DEMASIADAS_SOLICITUDES`| Se pasó `RATE_LIMIT_MAX` en la ventana de 60 s   |
| 500    | `ERROR_INTERNO`        | Fallo no previsto; se registra en el log del servidor y **no** se filtra el detalle al cliente |

### El periodo es una fecha, no un texto

`ventas.periodo` es un `DATE` de Postgres con el **primer día del mes** (`2026-01-01`),
porque el grano del dato es mensual. Un `CHECK` impide que entre un día que no sea el
primero, así que nadie puede meter `2026-01-17` a mano. La API sigue hablando `YYYY-MM`
en filtros y respuestas: es corto, ordena bien y no tiene ambigüedad de locale (a diferencia
de `01/01/2026`, donde nadie sabe si es día/mes o mes/día). Si necesitas la etiqueta
`DD/MMMM` para mostrar, el pipeline ya la produce:

```
1/enero | 1/febrero | 1/marzo | 1/abril | 1/mayo | 1/junio
```

y queda en `pipeline/reporte-limpieza.json` como `{ iso: "2026-01-01", etiqueta: "1/enero", filas: 82387 }`.

> El `date` de `pg` vuelve como `Date` en JS a medianoche local, y al serializar se corre
> un día entero (UTC-5 → día anterior). Por eso el driver devuelve las fechas como texto y
> los agregados las formatean con `to_char(v.periodo, 'YYYY-MM')` **en Postgres**, donde no
> hay zona horaria que las mueva. Hay dos pruebas que lo vigilan.

### Definiciones de negocio

- **Venta neta** suma todo, notas crédito incluidas. **Venta bruta** solo positiva.
- **Clientes activos**: clientes con al menos una compra positiva en el rango (quien
  solo devuelve no cuenta).
- **% devoluciones** = `|monto de notas crédito| / venta bruta × 100`.
- **Variación vs mes anterior**: último mes del rango contra el mes inmediatamente
  previo. Si el rango trae un solo mes, la API pide un mes extra hacia atrás para
  poder comparar; si no hay serie, devuelve `null` en vez de inventar un número.
- **Proyección**: regresión lineal sobre los meses reales, anclada en el último real y
  proyectada hasta diciembre. Con menos de dos meses no hay tendencia y no se proyecta.
- Las notas crédito **no se descartan**: están en la venta neta y se reportan aparte,
  tal como documenta `DATA_QUALITY.md` §4.

---

## Seguridad

> Esta sección se auditó con una prueba de seguridad ofensiva completa:
> [`investigacion/Pentesting.md`](investigacion/Pentesting.md) (hallazgos originales)
> y [`investigacion/Pentesting-Post.md`](investigacion/Pentesting-Post.md) (reverificación
> tras el parche).

- **SQL parametrizado**: todo valor de la query string viaja como `$1, $2, ...`; sedes
  y asesores entran como *arrays* (`= ANY($1::text[])`). Ningún valor del usuario se
  concatena en el texto SQL, así que no hay superficie de inyección. Los nombres de
  columna del `ORDER BY` salen de una lista blanca (`leerOrden`, verificada con
  `Object.hasOwn` para no heredar propiedades de `Object.prototype`) y las direcciones de
  orden son un `asc|desc` cerrado. La búsqueda de clientes usa `strpos(lower(nombre), lower($1))`,
  sin comodines que el usuario pueda usar para barrer la tabla.
- **Helmet** en `proxy.ts` (`matcher` cubre toda la app, no solo `/api`): HSTS, `nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, sin fuga de `X-Powered-By`
  &mdash; también en el dashboard HTML, no únicamente en las respuestas JSON.
- **Antispam**: límite de 120 peticiones/minuto por identidad, con ventana fija, respuesta
  `429` y cabecera `X-RateLimit-Limit`. Esa identidad **solo** viene de `x-forwarded-for`/
  `x-real-ip` cuando `TRUST_PROXY=true`; esas cabeceras las controla el cliente, así que
  confiar en ellas sin un proxy reverso real delante deja el límite sin efecto (cualquiera
  lo evade rotando el valor). Sin `TRUST_PROXY` (el default, y lo que usa `docker-compose.yml`
  tal cual porque no trae proxy delante), todo el tráfico directo comparte un único cupo.
  Es, además, un contador **en memoria por instancia** con purga perezosa de entradas
  vencidas; si el API corre en varias réplicas, hay que moverlo a Redis/Upstash (queda
  anotado en el código).
- Sin autenticación: la API sirve cifras de venta internas. Si se expone a internet,
  añadir autenticación **antes** que el rate limit (un límite por identidad no es control
  de acceso).
- CSP queda desactivada a propósito: el API responde JSON y las páginas necesitan los
  scripts inline de Next; se define en la rama de UI con los `nonce` correctos.
- Paginación de `/clientes` con tope de `pagina*porPagina` acotado (máximo 2.000 páginas
  de hasta 100), para que un `OFFSET` grande no amplifique el costo de la consulta contra
  Postgres.

---

## Rendimiento

Medido en local sobre las **446 742 ventas** reales (Postgres en Docker, 10 conexiones):

| Endpoint                                   | Respuesta |
|--------------------------------------------|-----------|
| `GET /kpis` (sin filtros, 446 k filas)     | ~0.28 s   |
| `GET /ventas/tendencia` (sin filtros)       | ~0.27 s   |
| `GET /ventas/sedes`                        | ~0.47 s   |
| `GET /asesores/ranking`                    | ~0.40 s   |
| `GET /clientes?porPagina=20`               | ~0.29 s   |
| `GET /clientes/{codigo}`                   | ~0.02 s   |
| Cualquiera con filtro de sede/asesor/fecha | 0.02–0.17 s |

Requisitos cumplidos: **todos los endpoints de resumen por debajo de 1 s**. Dos decisiones
lo sostienen: las uniones a `clientes`/`asesores` se agregan solo cuando el endpoint las
necesita, y `/kpis` lanza su agregado y su serie en paralelo en vez de encadenarlos.
Las pruebas fallan si `/kpis` o `/ventas/tendencia` se pasan de 1 s.

---

## Pipeline de limpieza

`pipeline/limpieza.mjs` (JavaScript, `exceljs` en modo streaming) lee el Excel sucio y lo
sube a Postgres. Un solo archivo, sin pasos intermedios: **el Excel es la entrada, la base
es la salida**.

```bash
pnpm ingest                      # lee investigacion/Base.xlsx y carga en Postgres
node pipeline/limpieza.mjs --sin-db    # solo limpia y reporta, sin tocar la base
```

Aplica los hallazgos de `DATA_QUALITY.md`:

| Hallazgo (DATA_QUALITY.md)               | Cómo lo resuelve el pipeline                            |
|-----------------------------------------|---------------------------------------------------------|
| §1 `Periodo` en 6 formatos              | Regex `(\d{4})\D+?(\d{1,2})` → `2026-01-01`, DATE real; 0 inválidos |
| §2 `Cod Principal` con padding de texto  | `strip()` + conversión a entero; 0 no numéricos           |
| §3 Duplicados en maestras               | Deduplicación por llave: 133 + 94 + 332 = 559 filas       |
| §4 `Neto` negativos = notas crédito      | Se conservan; `es_nota_credito` es columna generada      |
| §5 Notas sin factura visible            | 94 detectadas, 36 clientes, quedan reportadas            |
| §6 Ceros y atípicos                     | 11 428 ceros contados y reportados, no se tocan          |
| §7 Huerfanos                            | 0: se reportarían y se descartarían, no entran a la base |

Deixa el resultado en `pipeline/reporte-limpieza.json` y lo imprime en consola.

### Idempotencia (requisito de llaves primarias)

Cada tabla tiene llave de negocio y la carga es `INSERT ... ON CONFLICT DO UPDATE`:
reingerir el mismo Excel **actualiza** las filas existentes y solo agrega las nuevas.

```bash
pnpm ingest && pnpm ingest   # segunda corrida: mismos conteos, cero duplicados
```

> El esquema vive en `db/migrations/` y se aplica con `pnpm migrate`. Cada archivo
> `NNNN_*.sql` corre una vez, en orden, y queda registrado en `schema_migrations`.
> `db/schema.sql` es un snapshot acumulado, solo para lectura. Reingerir no recrea
> tablas; las migraciones son la única vía de cambio al esquema.

El grano de `ventas` es `(periodo, cod_cliente, cod_material)`, que es único en el
dataset (verificado). `cliente_asesor` usa `cod_cliente` como llave primaria —y no
`(cod_cliente, cod_asesor)`— para garantizar **un asesor por cliente**: si un cliente
tuviera dos, ninguna venta se duplicaría al cruzar contra las sedes. El test lo comprueba
insertando dos veces y esperando 3 filas, no 6.

### Esquema

Migraciones en `db/migrations/` (cada `NNNN_*.sql` se aplica una vez, en orden).
Snapshot acumulado en `db/schema.sql` (solo lectura, para referencia).

| Tabla            | Llave primaria                        | Notas                                   |
|------------------|---------------------------------------|-----------------------------------------|
| `ventas`         | `(periodo, cod_cliente, cod_material)`| `periodo` es **DATE** (primer día del mes, con `CHECK` que rechaza otro día), `neto numeric(18,2)`, columna generada `es_nota_credito` |
| `clientes`       | `cod_cliente`                         | Del Excel `Clientes`                     |
| `materiales`     | `cod_material`                        | Del Excel `Materiales`                   |
| `asesores`       | `cod_asesor`                          | Del Excel `Sedes` (código, nombre, sede) |
| `cliente_asesor` | `cod_cliente`                         | Del Excel `Asesores` (es la asignación cliente→asesor) |

Índices: `ventas(periodo)`, `ventas(cod_cliente, periodo)`, `cliente_asesor(cod_asesor)`.

---

## Pruebas

- `tests/unit.test.mjs` — 18 pruebas unitarias para funciones puras (`variacion`,
  `proyectar`) y parsers de query string. No requieren servidor ni DB; corren en ms.
- `tests/api.test.mjs` — 22 pruebas de integración con el runner nativo de Node
  (`node:test`), sin framework extra. Levanta el servidor real (`next start`) contra
  Postgres y siembra datos deterministas en el **periodo 2090**, que no existe en el
  dataset, así que las pruebas son válidas con la base llena o vacía.

```bash
pnpm test:unit                                # solo unit, sin DB
docker compose up -d db && pnpm build && pnpm test:integration   # todo
```

Cobertura por endpoint (integración):

- `/kpis` — valores exactos del periodo (incluida una nota crédito), filtro por sede y
  asesor, `400` por periodo inválido y por `desde > hasta`, intento de inyección
  rechazado, **tiempo < 1 s**.
- `/ventas/tendencia` — serie real contra la esperada, proyección hasta diciembre,
  caso de un solo mes (no proyecta), serie real de 2026 con proyección a diciembre, **tiempo < 1 s**.
- `/ventas/sedes` — las 7 sedes con venta suman 100% de participación, filtro por asesor.
- `/asesores/ranking` — orden descendente por venta y variación calculada.
- `/clientes` — paginación, búsqueda parcial, orden por nombre, `400` por orden desconocido.
- `/clientes/{codigo}` — ficha con historial y materiales, `404`, `400` por código no numérico.
- Seguridad — cabeceras de Helmet, `X-RateLimit-Limit`, `429 + Retry-After` al exceder.
- Contrato — el JSON de cada endpoint cumple el OpenAPI documentado.
- Schema — campos VARCHAR acotados, cod_asesor fuera de patrón rechazado.
- Migraciones — el runner es idempotente.
- Documentación — `/api/docs/openapi.json` expone los seis endpoints.
- Idempotencia — doble `INSERT` del mismo grano no duplica filas.

---

## Estructura

```
app/
  api/
    kpis/route.ts                 GET  /kpis
    ventas/tendencia/route.ts     GET  /ventas/tendencia
    ventas/sedes/route.ts         GET  /ventas/sedes
    asesores/ranking/route.ts     GET  /asesores/ranking
    asesores/[codigo]/route.ts    GET  /asesores/{codigo}
    clientes/route.ts             GET  /clientes
    clientes/[codigo]/route.ts    GET  /clientes/{codigo}
    docs/route.ts                 GET  /api/docs            (Swagger UI)
    docs/openapi.json/route.ts    GET  /api/docs/openapi.json
  lib/api/
    analitica.ts                  regresión lineal y variación (funciones puras)
    repos/ventas.ts               queries de /kpis, /ventas/*
    repos/clientes.ts             queries de /clientes, /clientes/{codigo}
    repos/asesores.ts             queries de /asesores/ranking y /asesores/{codigo}
    db.ts                         pool de `pg`
    filtros.ts                    validación de la query string
    http.ts                       errores 400/404/500 y envoltorio de handlers
    openapi.ts                    contrato OpenAPI
db/schema.sql                     snapshot del esquema (solo lectura)
db/migrations/NNNN_*.sql         migraciones incrementales
db/migrate.mjs                   runner de migraciones
pipeline/extract.mjs             lectura del Excel
pipeline/transform.mjs           normalización de filas
pipeline/load.mjs                conexión a Postgres y carga
pipeline/limpieza.mjs            orquestador del pipeline
proxy.ts                          Helmet + límite de peticiones
tests/unit.test.mjs               pruebas unitarias (funciones puras y parsers)
tests/api.test.mjs                pruebas de integración
docker-compose.yml                Postgres + Next en producción
```

> Ver también: `docs/arquitectura.md`, `docs/seguridad.md`, `docs/decisiones.md`.

> **Frontend conectado a la API:** el dashboard (`app/components/dashboard/`) ya no
> calcula nada localmente a partir de un dataset generado en el navegador — pide
> `/api/kpis`, `/api/ventas/tendencia`, `/api/ventas/sedes`, `/api/asesores/ranking`,
> `/api/asesores/{codigo}`, `/api/clientes` y `/api/clientes/{codigo}` directamente
> (`app/lib/apiClient.ts`). La única pieza que sigue viviendo en los dos lados es
> `variacion()`, una fórmula de una línea: se deja duplicada a propósito porque el
> cliente no puede importar `app/lib/api/*` (ese código asume runtime de servidor).
> `proyectar()` ya no tiene copia en el cliente: `/ventas/tendencia` devuelve la
> proyección ya calculada.
>
> El filtro de **material** del dashboard de demostración no tiene equivalente hoy:
> ningún endpoint de resumen filtra por material (solo `/clientes/{codigo}` devuelve
> el top 8 de materiales de un cliente puntual), así que se quitó del selector de
> filtros en vez de dejar un control que no hace nada contra datos reales.
