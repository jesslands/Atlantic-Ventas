# Seguridad

Capas y decisiones, sin advertising. Cada línea de defensa tiene su test en `tests/`.

## 1. SQL parametrizado

- Toda query construye el `WHERE`/`HAVING` con `$1, $2, ...` y empuja valores a `params[]`. No se concatena texto del usuario al SQL.
- Listas como `sedes` y `asesores` viajan como `text[]` y entran con `= ANY($1::text[])`.
- El `ORDER BY` sale de una whitelist de columnas (`leerOrden` en `consultas.ts:178`); las direcciones son un set cerrado (`asc|desc`).
- La búsqueda de clientes (`/clientes?q=...`) usa `strpos(lower(nombre), lower($1))`, sin comodines del usuario.

Test: `api.test.mjs` -> `GET /kpis no es inyectable por query string` (manda `DROP TABLE` en `sede=` y verifica 400 + que la tabla sigue viva).

## 2. Cabeceras HTTP (Helmet)

`proxy.ts:28` monta `helmet()` con `contentSecurityPolicy: false` (la API responde JSON; la CSP vive en la rama UI).

Cabeceras garantizadas, validadas en `api.test.mjs`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` (anti-click o wrap)
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy`
- Sin `X-Powered-By` (eliminado por Helmet)

## 3. Rate limit

`proxy.ts` lleva un contador en memoria por IP. Al exceder:

- Status `429`
- `Retry-After: 60`
- Cuerpo `{ error: { codigo: "DEMASIADAS_SOLICITUDES" } }`
- Cabecera `X-RateLimit-Limit` expuesta en cada respuesta.

Límite por defecto: 120 peticiones/minuto/IP (env `RATE_LIMIT_MAX`).

**No usar como control de acceso.** Un rate limit por IP no es autenticación; si la API se expone a internet, añadir auth **antes** que el rate limit.

Limitación conocida: el contador es por instancia. Si el API corre en varias réplicas, mover a Redis/Upstash. Ver nota en `proxy.ts:5`.

## 4. Errores: 500 sin filtrar

`manejar()` (`http.ts:25`) es el único punto que traduce excepciones a respuestas. Si no es `ApiError`, loguea en consola y devuelve `{ error: { codigo: "ERROR_INTERNO", mensaje: "..." } }` sin el detalle de la base.

## 5. CORS y CSP

- CORS: deliberadamente sin configurar (mismo origen en la UI montada por Next).
- CSP: desactivada en el proxy, se define en la UI con `nonce` para los scripts inline.

## 6. Validación al límite

- Periodo: regex `^\d{4}-(0[1-9]|1[0-2])$`.
- Asesor: regex `^ASE-\d{3}$`.
- Sede/material: regex `^[A-ZÁÉÍÓÚÑ0-9 ._-]{1,60}$` (case-insensitive, se almacena a mayúsculas).
- Entero: regex `^\d{1,6}$` + cota máxima por uso (`pagina<=100_000`, `porPagina<=100`, `limite<=100`).

Todo se valida en `filtros.ts`; cualquier falla lanza `peticionInvalida()` (400 con `detalles`).

## 7. Lo que no hay (y por qué)

| Item | Razón |
|------|------|
| Auth (sesión, JWT) | API de cifras internas. Documentado en `README.md`. |
| HTTPS obligatorio | Se asume terminado aguas arriba (proxy reverso o ingress). |
| Auditoría de deps en CI | Pendiente: añadir `npm audit`/`pnpm audit` al workflow. |
| Logs estructurados | Hoy `console.error`; migrar a JSON con `requestId` cuando se pida. |

## Tests relevantes

- `GET /kpis no es inyectable por query string` (api.test.mjs)
- `el API responde con cabeceras de seguridad (helmet)` (api.test.mjs)
- `el rate limit responde 429 + Retry-After al superar el límite` (api.test.mjs)