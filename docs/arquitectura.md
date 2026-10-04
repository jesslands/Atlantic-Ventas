# Arquitectura

Mapa de responsabilidades por archivo. La idea es que cada archivo cambie por **una sola razón**.

```
app/
├── kpis/route.ts                 -> delega en lib/api/, no contiene lógica
├── ventas/{tendencia,sedes}/    -> idem
├── asesores/{ranking,[codigo]}/  -> idem
├── clientes/route.ts             -> idem
├── clientes/[codigo]/route.ts    -> idem
└── lib/api/
    ├── analitica.ts              funciones puras (regresión, variación)
    ├── repos/ventas.ts           SQL de /kpis, /ventas/*
    ├── repos/clientes.ts         SQL de /clientes, /clientes/{codigo}, /clientes/{codigo}/compras
    ├── repos/materiales.ts       SQL de /categorias, /categorias/{nombre}, /subcategorias/{nombre}, /materiales, /materiales/{codigo}
    ├── repos/asesores.ts         SQL de /asesores/ranking, /asesores/{codigo}
    ├── db.ts                     pool de pg + parsers de tipos
    ├── filtros.ts                validación de la query string
    ├── http.ts                   ApiError + wrapper `manejar`
    └── openapi.ts                contrato OpenAPI 3.1
proxy.ts                          Helmet + rate limit (matcher: toda la app menos
                                   assets de _next; el limite de peticiones solo
                                   cuenta en /api)
db/schema.sql                     esquema + índices (idempotente)
pipeline/limpieza.mjs             Excel sucio -> Postgres (upsert)
tests/unit.test.mjs               funciones puras y parsers
tests/api.test.mjs                integración contra next start + Postgres
```


### Justificación de la arquitectura

Se implementó esta arquitectura siguiendo el principio de **“Preferimos algo pequeño y bien hecho a algo grande a medias”**.
Para ello, se eligió **Next.js**, ya que permite desarrollar el frontend y, al mismo tiempo, construir el backend, gestionar rutas y crear APIs dentro del mismo proyecto.
Esto evita la necesidad de mantener un backend independiente o incorporar otro lenguaje de programación, reduciendo la complejidad y evitando **sobreingeniería para el alcance actual del proyecto**.
De esta forma, se mantiene una arquitectura **simple, coherente y fácil de mantener**, dejando la posibilidad de evolucionarla en el futuro si las necesidades del proyecto lo requieren.


## Principios aplicados

- **Rutas finas**: cada `route.ts` parsea parámetros, llama a `consultas.ts` y envuelve la salida en JSON. La lógica no vive en la ruta.
- **SQL en un solo lugar**: cualquier cambio en una query pasa por `consultas.ts`. Los nombres de columna del `ORDER BY` salen de una whitelist (`leerOrden`); las direcciones son un set cerrado.
- **Errores por código**: `ApiError` lleva `status + código + mensaje + detalles`. `manejar()` es el único punto que traduce excepciones a respuestas; los 500 no filtran detalles.
- **Filtros como tipos**: `Filtros` es el contrato que comparten las queries y los handlers. El parser `filtros.ts` valida al límite y lanza errores con `detalles` por campo.

## Decisiones de diseño

- **Una sola fuente de verdad para el orden de los clientes**: la whitelist `ORDENES_CLIENTE` mapea nombres de API a columnas SQL. Sin concatenación de strings del usuario en el `ORDER BY`.
- **Series y agregados en `/kpis` lanzan en paralelo**: `Promise.all([resumen, serie])` en `repos/ventas.ts` ahorra medio ida y vuelta secuencial.
- **Joins solo cuando hacen falta**: `desdeVentas(filtros, { cliente, asesor })` agrega `JOIN clientes`/`JOIN asesor` solo cuando el endpoint los necesita. Sobre 446 k filas, cada join cuenta.
- **DATE, no VARCHAR para periodos**: `periodo` es `DATE` con `CHECK EXTRACT(DAY FROM periodo) = 1`. Así no hay deriva por locale ni por zona horaria.
- **Notas crédito no se descartan**: columna generada `es_nota_credito`. Se reportan y se conservan, como documenta `investigacion/DATA_QUALITY.md`.

## Cuando añadas un endpoint

1. La ruta importa de `lib/api/consultas.ts` (o crear allí).
2. Si el endpoint acepta filtros de los comunes, reutiliza `leerFiltros`.
3. Documenta el endpoint en `openapi.ts`.
4. Si tiene nueva lógica pura, ponla en `analitica.ts` con tests en `tests/unit.test.mjs`.
5. Si toca SQL nuevo, parametriza todo. Cero concatenación.
