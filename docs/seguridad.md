# Seguridad

Capas y decisiones, sin advertising. Cada línea de defensa tiene su test en `tests/`.

> Este documento se actualizó tras una prueba de seguridad ofensiva completa contra la
> API. Hallazgos originales y evidencia en [`investigacion/Pentesting.md`](../investigacion/Pentesting.md);
> qué se corrigió y cómo se reverificó en [`investigacion/Pentesting-Post.md`](../investigacion/Pentesting-Post.md).

## 1. SQL parametrizado

- Toda query construye el `WHERE`/`HAVING` con `$1, $2, ...` y empuja valores a `params[]`. No se concatena texto del usuario al SQL.
- Listas como `sedes` y `asesores` viajan como `text[]` y entran con `= ANY($1::text[])`.
- El `ORDER BY` sale de una whitelist de columnas (`leerOrden` en `repos/clientes.ts:16`),
  comprobada con `Object.hasOwn` y no con `in`: `in` también resuelve por la cadena de
  prototipos, así que `__proto__`/`constructor`/`toString` pasaban como si fueran valores
  válidos y su valor heredado se colaba crudo en el `ORDER BY` (PT-02, corregido). Las
  direcciones son un set cerrado (`asc|desc`).
- La búsqueda de clientes (`/clientes?q=...`) usa `strpos(lower(nombre), lower($1))`, sin comodines del usuario.

Test: `api.test.mjs` -> `GET /kpis no es inyectable por query string` (manda `DROP TABLE` en `sede=` y verifica 400 + que la tabla sigue viva).

## 2. Cabeceras HTTP (Helmet)

`proxy.ts:58` monta `helmet()` con `contentSecurityPolicy: false` (la API responde JSON; la CSP vive en la rama UI).
El `matcher` (`proxy.ts:84`) cubre **toda la app** (solo excluye `_next/static`, `_next/image`
y `favicon.ico`), no únicamente `/api/*`: hasta el PT-03 del pentest, el dashboard HTML
(`/`, `/clientes`, `/asesores`) se servía sin ninguna de estas cabeceras.

Cabeceras garantizadas, validadas en `api.test.mjs`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` (anti-click o wrap)
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy`
- Sin `X-Powered-By` (eliminado por Helmet, ahora también en las páginas)

## 3. Rate limit

`proxy.ts` lleva un contador en memoria por identidad, con purga perezosa de entradas
vencidas (`limpiarVencidos`, `proxy.ts:36`). Al exceder:

- Status `429`
- `Retry-After: 60`
- Cuerpo `{ error: { codigo: "DEMASIADAS_SOLICITUDES" } }`
- Cabecera `X-RateLimit-Limit` expuesta en cada respuesta de `/api`.

Límite por defecto: 120 peticiones/minuto/identidad (env `RATE_LIMIT_MAX`).

**La identidad solo es `x-forwarded-for`/`x-real-ip` si `TRUST_PROXY=true`.** Hasta el
pentest (PT-01), el código confiaba en esas cabeceras siempre, aunque las pone el propio
cliente: con un proxy reverso de confianza delante, se evadía el límite por completo
rotando el valor en cada petición (130/130 peticiones pasaron en la prueba). Por eso ahora:

- `TRUST_PROXY` sin definir (default, y lo que usa `docker-compose.yml` porque no trae
  proxy delante) → se ignoran esas cabeceras y **todo el tráfico directo comparte un
  único cupo**. Es la única opción honesta cuando no hay forma de verificar quién puso
  la cabecera.
- `TRUST_PROXY=true` (activar solo si el puerto de la app no es alcanzable salvo a través
  de ese proxy) → se usa el **último** salto de `x-forwarded-for` (el que agregó el proxy
  de confianza, no el que pudo inventar el cliente).

**No usar como control de acceso.** Un rate limit por identidad no es autenticación; si la API se expone a internet, añadir auth **antes** que el rate limit.

Limitación conocida: el contador sigue siendo por instancia. Si el API corre en varias réplicas, mover a Redis/Upstash. Ver nota en `proxy.ts:4`.

## 4. Errores: 500 sin filtrar

`manejar()` (`http.ts:25`) es el único punto que traduce excepciones a respuestas. Si no es `ApiError`, loguea en consola y devuelve `{ error: { codigo: "ERROR_INTERNO", mensaje: "..." } }` sin el detalle de la base.

## 5. CORS y CSP

- CORS: deliberadamente sin configurar (mismo origen en la UI montada por Next).
- CSP: desactivada en el proxy, se define en la UI con `nonce` para los scripts inline.

## 6. Validación al límite

- Periodo: regex `^\d{4}-(0[1-9]|1[0-2])$`.
- Asesor: regex `^ASE-\d{3}$`.
- Sede/material: regex `^[A-ZÁÉÍÓÚÑ0-9 ._-]{1,60}$` (case-insensitive, se almacena a mayúsculas).
- Entero: regex `^\d{1,6}$` + cota máxima por uso (`pagina<=2_000`, `porPagina<=100`, `limite<=100`).
  El tope de `pagina` bajó de 100.000 a 2.000 (PT-04): con `porPagina=100` el `OFFSET`
  máximo pasa de 10.000.000 a 199.900 filas — de sobra para el catálogo actual (11.288
  clientes) sin dejar una consulta gratis-para-el-atacante y cara-para-Postgres.

Todo se valida en `filtros.ts`; cualquier falla lanza `peticionInvalida()` (400 con `detalles`).

## 7. Lo que no hay (y por qué)

| Item | Razón |
|------|------|
| Auth (sesión, JWT) | API de cifras internas. Documentado en `README.md`. |
| HTTPS obligatorio | Se asume terminado aguas arriba (proxy reverso o ingress). |
| Auditoría de deps en CI | `pnpm audit --prod` corre en el job `static` del workflow desde PT-06. |
| Logs estructurados | Hoy `console.error`; migrar a JSON con `requestId` cuando se pida. |

## 8. Cadena de suministro

- `/api/docs` carga Swagger UI desde `unpkg.com` con versión fija y atributo `integrity`
  (SRI): un CDN o paquete comprometido ya no puede cambiar ese JS/CSS sin que el hash
  deje de coincidir (PT-07). Subir de versión implica recalcular el hash a mano —
  ver el comentario en `app/api/docs/route.ts`.
- `pnpm-lock.yaml` fija `uuid` (dependencia transitiva de `exceljs`) a `>=11.1.1` vía
  `pnpm.overrides` en `package.json`, por un advisory de bounds-check en buffers (PT-06).
  `braces` (transitiva de `eslint-config-next`, solo dev) tiene un advisory de ReDoS sin
  versión corregida publicada todavía aguas arriba: no se empaqueta en producción: se
  monitorea, no se fuerza una versión.

## Tests relevantes

- `GET /kpis no es inyectable por query string` (api.test.mjs)
- `el API responde con cabeceras de seguridad (helmet)` (api.test.mjs)
- `el rate limit responde 429 + Retry-After al superar el límite` (api.test.mjs)