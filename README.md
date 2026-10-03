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
| `pnpm test`        | 17 pruebas de integración contra el API real         |
| `pnpm build`       | build de producción                                  |
| `pnpm typecheck`   | `tsc --noEmit`                                       |
| `pnpm lint`        | eslint                                               |

Variables de entorno (`.env.example`, ninguna con secretos reales):

| Variable          | Por defecto                          | Para qué                          |
|-------------------|--------------------------------------|-----------------------------------|
| `DATABASE_URL`    | `postgres://atlantic:atlantic@localhost:5432/atlantic` | Conexión a Postgres (compose la sobrescribe con el host `db`) |
| `DB_POOL_MAX`     | `10`                                 | Conexiones máximas del pool       |
| `RATE_LIMIT_MAX`  | `120`                                | Peticiones/minuto/IP en `/api`    |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `atlantic` / `atlantic` / `atlantic` / `5432` | Credenciales de la base;compose las arma en `DATABASE_URL` |
| `APP_PORT`        | `3000`                               | Puerto del API en el host          |

---

## Documentación de la API

**Swagger UI en `/api/docs`** (interactivo) y el contrato OpenAPI 3.1 en
`/api/docs/openapi.json`. Todos los endpoints de cifras aceptan los mismos
filtros opcionales:

| Filtro   | Formato                       | Notas                                        |
|----------|-------------------------------|----------------------------------------------|
| `desde`  | `YYYY-MM`                     | Periodo inicial, inclusive                  |
| `hasta`  | `YYYY-MM`                     | Periodo final, inclusive                     |
| `sede`   | `BOGOTA,CALI`                 | Repetible o separado por coma; sin distinguir mayúsculas |
| `asesor` | `ASE-004`                     | Repetible o separado por coma                |

| Endpoint                | Devuelve                                                                              |
|-------------------------|---------------------------------------------------------------------------------------|
| `GET /kpis`             | Venta neta y bruta, transacciones, clientes activos, ticket promedio, notas crédito, % devoluciones y variación contra el mes anterior |
| `GET /ventas/tendencia` | Serie mensual real + proyección por regresión lineal hasta diciembre                 |
| `GET /ventas/sedes`     | Venta, clientes y participación por sede                                              |
| `GET /asesores/ranking` | Ranking por venta neta con clientes, ticket medio y variación (`?limite=`, máx. 100)  |
| `GET /clientes`         | Listado paginado con búsqueda (`?q=`), ordenamiento (`?orden=`, `?dir=`) y filtros     |
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

- **SQL parametrizado**: todo valor de la query string viaja como `$1, $2, ...`; sedes
  y asesores entran como *arrays* (`= ANY($1::text[])`). Ningún valor del usuario se
  concatena en el texto SQL, así que no hay superficie de inyección. Los nombres de
  columna del `ORDER BY` salen de una lista blanca (`leerOrden`) y las direcciones de
  orden son un `asc|desc` cerrado. La búsqueda de clientes usa `strpos(lower(nombre), lower($1))`,
  sin comodines que el usuario pueda usar para barrer la tabla.
- **Helmet** en `proxy.ts` (Node runtime, `matcher: /api/:path*`): HSTS, `nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, sin fuga de `X-Powered-By`.
- **Antispam**: límite de 120 peticiones/minuto/IP con ventana fija, respuesta `429` y
  cabecera `X-RateLimit-Limit`. Es un contador **en memoria por instancia**; si el API
  corre en varias réplicas, hay que moverlo a Redis/Upstash (queda anotado en el código).
- Sin autenticación: la API sirve cifras de venta internas. Si se expone a internet,
  añadir autenticación **antes** que el rate limit (un límite por IP no es control de acceso).
- CSP queda desactivada a propósito: el API responde JSON y las páginas necesitan los
  scripts inline de Next; se define en la rama de UI con los `nonce` correctos.

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
| §1 `Periodo` en 6 formatos              | Regex `(\d{4})\D+?(\d{1,2})` → `YYYY-MM`; 0 inválidos    |
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

El grano de `ventas` es `(periodo, cod_cliente, cod_material)`, que es único en el
dataset (verificado). `cliente_asesor` usa `cod_cliente` como llave primaria —y no
`(cod_cliente, cod_asesor)`— para garantizar **un asesor por cliente**: si un cliente
tuviera dos, ninguna venta se duplicaría al cruzar contra las sedes. El test lo comprueba
insertando dos veces y esperando 3 filas, no 6.

### Esquema

`db/schema.sql` (idempotente, se ejecuta en cada corrida del pipeline):

| Tabla            | Llave primaria                        | Notas                                   |
|------------------|---------------------------------------|-----------------------------------------|
| `ventas`         | `(periodo, cod_cliente, cod_material)`| `neto numeric(18,2)`, `CHECK` de formato de periodo, columna generada `es_nota_credito` |
| `clientes`       | `cod_cliente`                         | Del Excel `Clientes`                     |
| `materiales`     | `cod_material`                        | Del Excel `Materiales`                   |
| `asesores`       | `cod_asesor`                          | Del Excel `Sedes` (código, nombre, sede) |
| `cliente_asesor` | `cod_cliente`                         | Del Excel `Asesores` (es la asignación cliente→asesor) |

Índices: `ventas(periodo)`, `ventas(cod_cliente, periodo)`, `cliente_asesor(cod_asesor)`.

---

## Pruebas

`tests/api.test.mjs` — 17 pruebas de integración con el runner nativo de Node
(`node:test`), sin framework extra. Levanta el servidor real (`next start`) contra
Postgres y siembra datos deterministas en el **periodo 2090**, que no existe en el
dataset, así que las pruebas son válidas con la base llena o vacía.

```bash
docker compose up -d db && pnpm build && pnpm test
```

Cobertura por endpoint:

- `/kpis` — valores exactos del periodo (incluida una nota crédito), filtro por sede y
  asesor, `400` por periodo inválido y por `desde > hasta`, intento de inyección
  rechazado, **tiempo < 1 s**.
- `/ventas/tendencia` — serie real contra la esperada, proyección hasta diciembre,
  caso de un solo mes (no proyecta), serie real de 2026 con proyección a diciembre, **tiempo < 1 s**.
- `/ventas/sedes` — las 7 sedes con venta suman 100% de participación, filtro por asesor.
- `/asesores/ranking` — orden descendente por venta y variación calculada.
- `/clientes` — paginación, búsqueda parcial, orden por nombre, `400` por orden desconocido.
- `/clientes/{codigo}` — ficha con historial y materiales, `404`, `400` por código no numérico.
- Seguridad — cabeceras de Helmet y `X-RateLimit-Limit` presentes.
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
    clientes/route.ts             GET  /clientes
    clientes/[codigo]/route.ts    GET  /clientes/{codigo}
    docs/route.ts                 GET  /api/docs            (Swagger UI)
    docs/openapi.json/route.ts    GET  /api/docs/openapi.json
  lib/api/
    analitica.ts                  regresión lineal y variación (funciones puras)
    consultas.ts                  todo el SQL parametrizado
    db.ts                         pool de `pg`
    filtros.ts                    validación de la query string
    http.ts                       errores 400/404/500 y envoltorio de handlers
    openapi.ts                    contrato OpenAPI
db/schema.sql                     esquema + índices
pipeline/limpieza.mjs             Excel sucio -> Postgres
proxy.ts                          Helmet + límite de peticiones
tests/api.test.mjs                pruebas de integración
docker-compose.yml                Postgres + Next en producción
```

> **Al integrar la rama `UI`:** sus helpers `proyectar`/`variacion` de
> `app/lib/analytics.ts` son equivalentes a los de `app/lib/api/analitica.ts`. Al unirlas
> hay que dejar una sola copia (re-exportar) para no mantener el mismo cálculo en dos sitios.
