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
            }),
          ),
          ...ERRORES,
        },
      },
    },
  },
} as const;
