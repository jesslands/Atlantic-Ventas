const PARAMETROS_FILTRO = [
  {
    name: "desde",
    in: "query",
    schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$", example: "2026-01" },
    description: "Periodo inicial inclusive (YYYY-MM).",
  },
  {
    name: "hasta",
    in: "query",
    schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$", example: "2026-06" },
    description: "Periodo final inclusive (YYYY-MM).",
  },
  {
    name: "sede",
    in: "query",
    schema: { type: "string", example: "BOGOTA,CALI" },
    description: "Sede(s) del asesor, separadas por coma. No distingue mayusculas.",
  },
  {
    name: "asesor",
    in: "query",
    schema: { type: "string", example: "ASE-004" },
    description: "Codigo(s) de asesor (ASE-###), separados por coma.",
  },
];

const respuesta = (detalle: string, schema: unknown) => ({
  description: detalle,
  content: { "application/json": { schema } },
});

const ERROR = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        codigo: { type: "string" },
        mensaje: { type: "string" },
        detalles: { type: "object" },
      },
    },
  },
};

const ERRORES = {
  400: respuesta("Parametro invalido", ERROR),
  404: respuesta("Recurso no encontrado", ERROR),
  429: respuesta("Límite de peticiones superado", ERROR),
  500: respuesta("Error interno", ERROR),
};

const objeto = (propiedades: Record<string, unknown>, requerido: string[] = []) => ({
  type: "object",
  properties: propiedades,
  ...(requerido.length ? { required: requerido } : {}),
});

const NUMERO = { type: "number", format: "double" };
const ENTERO = { type: "integer" };

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Atlantic Ventas API",
    version: "1.0.0",
    description:
      "Cifras de venta de Atlantic. Todos los endpoints aceptan los filtros opcionales `desde`, `hasta`, `sede` y `asesor`. Salen de una base ya depurada: los `Neto` negativos son notas credito y se reportan aparte, no se descartan.",
  },
  servers: [{ url: "/", description: "Instancia actual" }],
  tags: [
    { name: "Cifras" },
    { name: "Clientes" },
    { name: "Asesores" },
  ],
  paths: {
    "/kpis": {
      get: {
        tags: ["Cifras"],
        summary: "Indicadores del periodo",
        parameters: PARAMETROS_FILTRO,
        responses: {
          200: respuesta(
            "Indicadores con variacion contra el mes anterior",
            objeto({
              filtros: objeto({ desde: { type: "string" }, hasta: { type: "string" } }),
              kpis: objeto(
                {
                  venta_neta: NUMERO,
                  venta_bruta: NUMERO,
                  transacciones: ENTERO,
                  clientes_activos: ENTERO,
                  ticket_promedio: NUMERO,
                  notas_credito: ENTERO,
                  monto_notas: NUMERO,
                  ceros: ENTERO,
                  atipicos: ENTERO,
                  pct_devoluciones: NUMERO,
                  variacion_vs_mes_anterior: objeto({
                    mes: { type: "string" },
                    mes_anterior: { type: "string" },
                    pct: NUMERO,
                  }),
                },
                ["venta_neta", "transacciones", "clientes_activos", "ticket_promedio", "pct_devoluciones"],
              ),
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/ventas/tendencia": {
      get: {
        tags: ["Cifras"],
        summary: "Serie mensual real y proyeccion hasta diciembre",
        parameters: PARAMETROS_FILTRO,
        responses: {
          200: respuesta(
            "Puntos reales y proyeccion",
            objeto({
              filtros: { type: "object" },
              serie: {
                type: "array",
                items: objeto({
                  periodo: { type: "string" },
                  real: { type: ["number", "null"] },
                  proyeccion: { type: ["number", "null"] },
                  ventas: { type: ["number", "null"] },
                  notas: { type: ["number", "null"] },
                  montoNotas: { type: ["number", "null"] },
                  clientes: { type: ["number", "null"] },
                  ticketMediano: { type: ["number", "null"] },
                }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/ventas/sedes": {
      get: {
        tags: ["Cifras"],
        summary: "Venta y participacion por sede",
        parameters: PARAMETROS_FILTRO,
        responses: {
          200: respuesta(
            "Sedes ordenadas por venta",
            objeto({
              sedes: {
                type: "array",
                items: objeto({
                  sede: { type: "string" },
                  neto: NUMERO,
                  ventas: ENTERO,
                  clientes: ENTERO,
                  participacion: NUMERO,
                }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/asesores/ranking": {
      get: {
        tags: ["Asesores"],
        summary: "Ranking de asesores",
        parameters: [
          ...PARAMETROS_FILTRO,
          { name: "limite", in: "query", schema: { type: "integer", maximum: 100, default: 20 } },
        ],
        responses: {
          200: respuesta(
            "Ranking ordenado por venta neta",
            objeto({
              ranking: {
                type: "array",
                items: objeto({
                  codigo: { type: "string" },
                  nombre: { type: "string" },
                  sede: { type: "string" },
                  neto: NUMERO,
                  ventas: ENTERO,
                  clientes: ENTERO,
                  ticketMedio: NUMERO,
                  variacionPct: NUMERO,
                }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/clientes": {
      get: {
        tags: ["Clientes"],
        summary: "Listado paginado con busqueda y ordenamiento",
        parameters: [
          ...PARAMETROS_FILTRO,
          { name: "pagina", in: "query", schema: { type: "integer", minimum: 1, maximum: 2000, default: 1 } },
          { name: "porPagina", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "q", in: "query", schema: { type: "string", maxLength: 100 }, description: "Busqueda parcial por nombre." },
          {
            name: "orden",
            in: "query",
            schema: { type: "string", enum: ["neto", "ventas", "ultimaCompra", "nombre", "codigo"], default: "neto" },
          },
          { name: "dir", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
        ],
        responses: {
          200: respuesta(
            "Pagina de clientes",
            objeto({
              paginacion: objeto({ pagina: ENTERO, porPagina: ENTERO, total: ENTERO }),
              clientes: {
                type: "array",
                items: objeto({
                  cod_cliente: ENTERO,
                  nombre: { type: "string" },
                  tipo: { type: "string" },
                  sede: { type: "string" },
                  asesor: { type: "string" },
                  neto: NUMERO,
                  ventas: ENTERO,
                  notas: ENTERO,
                  monto_notas: NUMERO,
                  ultima_compra: { type: "string" },
                }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/asesores/{codigo}": {
      get: {
        tags: ["Asesores"],
        summary: "Ficha e historial mensual de un asesor",
        parameters: [
          {
            name: "codigo",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^ASE-\\d{3}$", example: "ASE-004" },
            description: "Codigo del asesor (ASE-###).",
          },
          ...PARAMETROS_FILTRO,
        ],
        responses: {
          200: respuesta(
            "Ficha con serie mensual y principales clientes",
            objeto({
              asesor: objeto({ codigo: { type: "string" }, nombre: { type: "string" }, sede: { type: "string" } }),
              neto: NUMERO,
              ventas: ENTERO,
              notas: ENTERO,
              monto_notas: NUMERO,
              ticket_medio: NUMERO,
              periodos: { type: "array", items: { type: "object" } },
              clientes: { type: "array", items: { type: "object" } },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/clientes/{codigo}": {
      get: {
        tags: ["Clientes"],
        summary: "Ficha e historial de compra de un cliente",
        parameters: [
          {
            name: "codigo",
            in: "path",
            required: true,
            schema: { type: "integer", example: 1000001 },
            description: "Codigo numerico del cliente.",
          },
          ...PARAMETROS_FILTRO,
        ],
        responses: {
          200: respuesta(
            "Ficha con serie mensual y top de materiales",
            objeto({
              cliente: objeto({ codigo: ENTERO, nombre: { type: "string" }, tipo: { type: "string" }, sede: { type: "string" }, asesor: { type: "string" } }),
              neto: NUMERO,
              ventas: ENTERO,
              notas: ENTERO,
              monto_notas: NUMERO,
              ticket_medio: NUMERO,
              primera_compra: { type: "string" },
              ultima_compra: { type: "string" },
              periodos: { type: "array", items: { type: "object" } },
              materiales: { type: "array", items: { type: "object" } },
              categorias: {
                type: "array",
                items: objeto({ categoria: { type: "string" }, neto: NUMERO, ventas: ENTERO }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/clientes/{codigo}/compras": {
      get: {
        tags: ["Clientes"],
        summary: "Historial de compras de un cliente, linea a linea (mes x material)",
        parameters: [
          {
            name: "codigo",
            in: "path",
            required: true,
            schema: { type: "integer", example: 1000001 },
            description: "Codigo numerico del cliente.",
          },
          ...PARAMETROS_FILTRO,
          { name: "pagina", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 1 } },
          { name: "porPagina", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "q", in: "query", schema: { type: "string", maxLength: 100 }, description: "Busqueda parcial por nombre de material." },
          { name: "orden", in: "query", schema: { type: "string", enum: ["periodo", "neto", "material"], default: "periodo" } },
          { name: "dir", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
        ],
        responses: {
          200: respuesta(
            "Pagina de compras del cliente",
            objeto({
              paginacion: objeto({ pagina: ENTERO, porPagina: ENTERO, total: ENTERO }),
              compras: {
                type: "array",
                items: objeto({
                  periodo: { type: "string" },
                  cod_material: ENTERO,
                  material: { type: "string" },
                  categoria: { type: ["string", "null"] },
                  neto: NUMERO,
                  nota_credito: { type: "boolean" },
                }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/categorias": {
      get: {
        tags: ["Materiales"],
        summary: "Neto, compras, clientes y participacion por categoria",
        parameters: [...PARAMETROS_FILTRO],
        responses: {
          200: respuesta(
            "Categorias de mayor a menor neto",
            objeto({
              categorias: {
                type: "array",
                items: objeto({ categoria: { type: "string" }, neto: NUMERO, ventas: ENTERO, clientes: ENTERO, materiales: ENTERO, participacion: NUMERO }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/categorias/{nombre}": {
      get: {
        tags: ["Materiales"],
        summary: "Ficha de una categoria: total del anio, mes a mes, principales clientes y materiales",
        parameters: [
          { name: "nombre", in: "path", required: true, schema: { type: "string", example: "CERDO" }, description: "Nombre de la categoria (no distingue mayusculas)." },
          ...PARAMETROS_FILTRO,
        ],
        responses: {
          200: respuesta(
            "Ficha de la categoria",
            objeto({
              categoria: { type: "string" },
              materiales: ENTERO,
              neto: NUMERO,
              ventas: ENTERO,
              clientes: ENTERO,
              notas: ENTERO,
              monto_notas: NUMERO,
              ticket_medio: NUMERO,
              anios: { type: "array", items: objeto({ anio: { type: "string" }, neto: NUMERO, ventas: ENTERO }) },
              periodos: {
                type: "array",
                items: objeto({ periodo: { type: "string" }, neto: NUMERO, ventas: ENTERO, clientes: ENTERO }),
              },
              top_clientes: {
                type: "array",
                items: objeto({ codigo: ENTERO, nombre: { type: "string" }, tipo: { type: "string" }, sede: { type: "string" }, neto: NUMERO, ventas: ENTERO }),
              },
              subcategorias: { type: "array", items: objeto({ subcategoria: { type: "string" }, neto: NUMERO, ventas: ENTERO }) },
              top_materiales: {
                type: "array",
                items: objeto({ codigo: ENTERO, nombre: { type: "string" }, subcategoria: { type: ["string", "null"] }, neto: NUMERO, ventas: ENTERO }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/subcategorias/{nombre}": {
      get: {
        tags: ["Materiales"],
        summary: "Ficha de una subcategoria: total del anio, mes a mes, clientes, marcas, calidades y materiales",
        parameters: [
          { name: "nombre", in: "path", required: true, schema: { type: "string", example: "CORTES DE CERDO" }, description: "Nombre de la subcategoria (no distingue mayusculas)." },
          ...PARAMETROS_FILTRO,
        ],
        responses: {
          200: respuesta(
            "Ficha de la subcategoria",
            objeto({
              subcategoria: { type: "string" },
              categoria: { type: "string" },
              materiales: ENTERO,
              neto: NUMERO,
              ventas: ENTERO,
              clientes: ENTERO,
              ticket_medio: NUMERO,
              anios: { type: "array", items: { type: "object" } },
              periodos: { type: "array", items: { type: "object" } },
              top_clientes: { type: "array", items: { type: "object" } },
              marcas: { type: "array", items: objeto({ nombre: { type: "string" }, neto: NUMERO, ventas: ENTERO }) },
              calidades: { type: "array", items: objeto({ nombre: { type: "string" }, neto: NUMERO, ventas: ENTERO }) },
              top_materiales: { type: "array", items: { type: "object" } },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/materiales": {
      get: {
        tags: ["Materiales"],
        summary: "Listado paginado de materiales con busqueda, categoria y ordenamiento",
        parameters: [
          ...PARAMETROS_FILTRO,
          { name: "pagina", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 1 } },
          { name: "porPagina", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "q", in: "query", schema: { type: "string", maxLength: 100 }, description: "Busqueda parcial por nombre." },
          { name: "categoria", in: "query", schema: { type: "string", example: "POLLO" } },
          { name: "orden", in: "query", schema: { type: "string", enum: ["neto", "ventas", "clientes", "nombre", "codigo"], default: "neto" } },
          { name: "dir", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
        ],
        responses: {
          200: respuesta(
            "Pagina de materiales",
            objeto({
              paginacion: objeto({ pagina: ENTERO, porPagina: ENTERO, total: ENTERO }),
              materiales: {
                type: "array",
                items: objeto({
                  cod_material: ENTERO,
                  nombre: { type: "string" },
                  categoria: { type: ["string", "null"] },
                  subcategoria: { type: ["string", "null"] },
                  marca: { type: ["string", "null"] },
                  neto: NUMERO,
                  ventas: ENTERO,
                  clientes: ENTERO,
                }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/materiales/{codigo}": {
      get: {
        tags: ["Materiales"],
        summary: "Ficha de un material: total del anio, mes a mes y principales clientes",
        parameters: [
          { name: "codigo", in: "path", required: true, schema: { type: "integer", example: 10256 }, description: "Codigo numerico del material." },
          ...PARAMETROS_FILTRO,
        ],
        responses: {
          200: respuesta(
            "Ficha del material",
            objeto({
              material: { type: "object" },
              neto: NUMERO,
              ventas: ENTERO,
              clientes: ENTERO,
              notas: ENTERO,
              monto_notas: NUMERO,
              ticket_medio: NUMERO,
              anios: { type: "array", items: objeto({ anio: { type: "string" }, neto: NUMERO, ventas: ENTERO }) },
              periodos: {
                type: "array",
                items: objeto({ periodo: { type: "string" }, neto: NUMERO, ventas: ENTERO, clientes: ENTERO }),
              },
              top_clientes: {
                type: "array",
                items: objeto({ codigo: ENTERO, nombre: { type: "string" }, tipo: { type: "string" }, sede: { type: "string" }, neto: NUMERO, ventas: ENTERO }),
              },
            }),
          ),
          ...ERRORES,
        },
      },
    },
    "/cargas": {
      get: {
        tags: ["Carga"],
        summary: "Filas que hay hoy en cada tabla",
        responses: {
          200: respuesta(
            "Conteo actual",
            objeto({
              actual: objeto(
                { ventas: ENTERO, clientes: ENTERO, materiales: ENTERO, asesores: ENTERO, asignaciones: ENTERO },
                ["ventas", "clientes", "materiales", "asesores", "asignaciones"],
              ),
            }, ["actual"]),
          ),
          429: ERRORES[429],
          500: ERRORES[500],
        },
      },
      delete: {
        tags: ["Carga"],
        summary: "Borrar ventas y maestras",
        description:
          "Vacía ventas, clientes, materiales, asesores y asignaciones en una transacción. Conserva el esquema: después basta con volver a cargar el Excel. No se puede deshacer.",
        responses: {
          200: respuesta(
            "Filas eliminadas por tabla",
            objeto({
              borrado: objeto({ ventas: ENTERO, clientes: ENTERO, materiales: ENTERO, asesores: ENTERO, asignaciones: ENTERO }),
            }, ["borrado"]),
          ),
          409: respuesta("Hay una carga en curso", ERROR),
          429: ERRORES[429],
          500: ERRORES[500],
        },
      },
      post: {
        tags: ["Carga"],
        summary: "Procesar un libro ya subido y cargarlo en Postgres",
        description:
          "Recibe `{ subida }`, el id de una subida completa (ver `/cargas/subidas`), y corre el pipeline de limpieza y carga en una sola transacción. Responde NDJSON: una línea `progreso` por avance y una línea final `listo`, `cancelado` o `error`. Si el cliente corta la conexión, el pipeline se detiene y la base queda sin cambios. Solo se admite una carga a la vez; al terminar, el archivo subido se borra.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: objeto({ subida: { type: "string", format: "uuid" } }, ["subida"]),
            },
          },
        },
        responses: {
          200: {
            description: "Stream de eventos, uno por línea",
            content: {
              "application/x-ndjson": {
                schema: objeto(
                  {
                    tipo: { type: "string", enum: ["progreso", "listo", "cancelado", "error"] },
                    etapa: {
                      type: "string",
                      enum: ["preparando", "maestras", "guardando_maestras", "ventas", "verificando"],
                    },
                    pct: NUMERO,
                    detalle: { type: "string" },
                    leidas: ENTERO,
                    cargado: { type: "object" },
                    mensaje: { type: "string" },
                  },
                  ["tipo"],
                ),
              },
            },
          },
          400: respuesta("Falta el id de la subida", ERROR),
          404: respuesta("La subida no existe o venció", ERROR),
          409: respuesta("Ya hay una carga en curso, o la subida no está completa", ERROR),
          429: ERRORES[429],
          500: ERRORES[500],
        },
      },
    },
    "/cargas/subidas": {
      post: {
        tags: ["Carga"],
        summary: "Abrir una subida por partes del libro de Excel",
        description:
          "El libro (hasta 1,5 GB) se sube en partes de `tamano_parte` bytes con `PUT /cargas/subidas/{id}`. Una subida sin actividad durante una hora se descarta.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: objeto({ tamano: ENTERO }, ["tamano"]) } },
        },
        responses: {
          201: respuesta(
            "Subida abierta",
            objeto({ id: { type: "string", format: "uuid" }, tamano: ENTERO, tamano_parte: ENTERO }, ["id", "tamano", "tamano_parte"]),
          ),
          400: ERRORES[400],
          413: respuesta("El archivo supera 1,5 GB", ERROR),
          429: ERRORES[429],
          500: ERRORES[500],
        },
      },
    },
    "/cargas/subidas/{id}": {
      put: {
        tags: ["Carga"],
        summary: "Anexar una parte a la subida",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "desde", in: "query", required: true, schema: ENTERO, description: "Bytes ya recibidos: la parte debe continuar exactamente ahí." },
        ],
        requestBody: {
          required: true,
          content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        },
        responses: {
          200: respuesta("Parte recibida", objeto({ recibido: ENTERO, tamano: ENTERO }, ["recibido", "tamano"])),
          400: respuesta("La parte llegó incompleta", ERROR),
          404: respuesta("La subida no existe o venció", ERROR),
          409: respuesta("`desde` no coincide con lo recibido; `detalles.recibido` dice desde dónde seguir", ERROR),
          413: respuesta("La parte excede el tamaño permitido", ERROR),
          429: ERRORES[429],
          500: ERRORES[500],
        },
      },
      delete: {
        tags: ["Carga"],
        summary: "Descartar una subida",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { 204: { description: "Subida descartada" }, 404: ERRORES[404], 429: ERRORES[429] },
      },
    },
  },
} as const;
