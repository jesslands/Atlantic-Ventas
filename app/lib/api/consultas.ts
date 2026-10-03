import { variacion, type FilaPeriodo } from "./analitica";
import { consultar } from "./db";
import { comoFecha, moverPeriodo, type Filtros } from "./filtros";
import { noEncontrado, peticionInvalida } from "./http";

/**
 * Un solo camino de acceso a las ventas: la sede de una venta es la del asesor de
 * su cliente. Las uniones se anaden solo cuando hacen falta, porque sobre 446 742
 * filas cada JOIN de mas se paga en cada peticion.
 */
const desdeVentas = (
  filtros: Filtros,
  necesita: { cliente?: boolean; asesor?: boolean } = {},
) => {
  const partes = ["FROM ventas v"];
  if (necesita.cliente) partes.push("JOIN clientes c ON c.cod_cliente = v.cod_cliente");
  if (necesita.asesor || necesita.cliente || filtros.sedes.length || filtros.asesores.length) {
    partes.push("JOIN cliente_asesor ca ON ca.cod_cliente = v.cod_cliente");
    partes.push("JOIN asesores a ON a.cod_asesor = ca.cod_asesor");
  }
  return partes.join(" ");
};

/**
 * Construye el WHERE solo con marcadores posicionales ($1, $2, ...). Ningun valor
 * recebido del usuario se concatena en el texto: las sedes y asesores viajan como
 * arrays parametrizados, asi que no hay superficie de inyeccion.
 */
const where = (filtros: Filtros, busqueda?: string) => {
  const condiciones: string[] = [];
  const params: unknown[] = [];
  if (filtros.desde) condiciones.push(`v.periodo >= $${params.push(comoFecha(filtros.desde))}::date`);
  if (filtros.hasta) condiciones.push(`v.periodo <= $${params.push(comoFecha(filtros.hasta))}::date`);
  if (filtros.sedes.length)
    condiciones.push(`upper(a.sede) = ANY($${params.push(filtros.sedes)}::text[])`);
  if (filtros.asesores.length)
    condiciones.push(`a.cod_asesor = ANY($${params.push(filtros.asesores)}::text[])`);
  if (busqueda)
    condiciones.push(`strpos(lower(c.nombre), lower($${params.push(busqueda)})) > 0`);
  return { where: condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "", params };
};

const AGREGADO_MENSUAL = `to_char(v.periodo, 'YYYY-MM') AS periodo,
       sum(v.neto)::float8 AS neto,
       count(*)::int AS ventas,
       count(*) FILTER (WHERE v.neto < 0)::int AS notas,
       coalesce(sum(v.neto) FILTER (WHERE v.neto < 0), 0)::float8 AS monto_notas,
       count(DISTINCT v.cod_cliente)::int AS clientes,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY v.neto)
         FILTER (WHERE v.neto > 0)::float8 AS ticket_mediano`;

export const serieMensual = async (filtros: Filtros): Promise<FilaPeriodo[]> => {
  const { where: w, params } = where(filtros);
  const { rows } = await consultar<FilaPeriodo>(
    `SELECT ${AGREGADO_MENSUAL} ${desdeVentas(filtros)} ${w}
     GROUP BY v.periodo ORDER BY v.periodo`,
    params,
  );
  return rows;
};

type ResumenKpi = {
  venta_neta: number;
  venta_bruta: number;
  transacciones: number;
  clientes_activos: number;
  ticket_promedio: number;
  notas_credito: number;
  monto_notas: number;
};

export type Kpis = ResumenKpi & {
  pct_devoluciones: number;
  variacion_vs_mes_anterior: { mes: string; mes_anterior: string; pct: number } | null;
};

export const kpis = async (filtros: Filtros): Promise<Kpis> => {
  const { where: w, params } = where(filtros);
  // La serie pide un mes extra hacia atras para poder comparar contra el mes anterior.
  const desdeSerie = filtros.desde ? moverPeriodo(filtros.desde, -1) : filtros.desde;
  const [resumen, serie] = await Promise.all([
    consultar<ResumenKpi>(
      `SELECT coalesce(sum(v.neto), 0)::float8 AS venta_neta,
            coalesce(sum(v.neto) FILTER (WHERE v.neto > 0), 0)::float8 AS venta_bruta,
            count(*)::int AS transacciones,
            count(DISTINCT v.cod_cliente) FILTER (WHERE v.neto > 0)::int AS clientes_activos,
            coalesce(avg(v.neto), 0)::float8 AS ticket_promedio,
            count(*) FILTER (WHERE v.neto < 0)::int AS notas_credito,
            coalesce(sum(v.neto) FILTER (WHERE v.neto < 0), 0)::float8 AS monto_notas
     ${desdeVentas(filtros)} ${w}`,
      params,
    ),
    serieMensual({ ...filtros, desde: desdeSerie }),
  ]);

  const base = resumen.rows[0];
  const actual = serie.at(-1);
  const anterior = serie.at(-2);

  return {
    ...base,
    pct_devoluciones: base.venta_bruta ? (Math.abs(base.monto_notas) / base.venta_bruta) * 100 : 0,
    variacion_vs_mes_anterior:
      actual && anterior
        ? { mes: actual.periodo, mes_anterior: anterior.periodo, pct: variacion(actual.neto, anterior.neto) }
        : null,
  };
};

export type FilaSede = { sede: string; neto: number; ventas: number; clientes: number; participacion: number };

export const porSede = async (filtros: Filtros): Promise<FilaSede[]> => {
  const { where: w, params } = where(filtros);
  const { rows } = await consultar<Omit<FilaSede, "participacion">>(
    `SELECT a.sede, sum(v.neto)::float8 AS neto, count(*)::int AS ventas,
            count(DISTINCT v.cod_cliente)::int AS clientes
     ${desdeVentas(filtros, { asesor: true })} ${w} GROUP BY a.sede ORDER BY neto DESC`,
    params,
  );
  const total = rows.reduce((suma, fila) => suma + fila.neto, 0);
  return rows.map((fila) => ({
    ...fila,
    participacion: total ? (fila.neto / total) * 100 : 0,
  }));
};

type FilaAsesorCruda = { cod_asesor: string; nombre: string; sede: string; periodo: string | null; neto: number; ventas: number; clientes: number };

export type FilaAsesor = {
  codigo: string;
  nombre: string;
  sede: string;
  neto: number;
  ventas: number;
  clientes: number;
  ticketMedio: number;
  variacionPct: number;
};

export const rankingAsesores = async (filtros: Filtros, limite: number): Promise<FilaAsesor[]> => {
  const { where: w, params } = where(filtros);
  const { rows } = await consultar<FilaAsesorCruda>(
    // Dos granulidades en una ida: periodo NULL = total del asesor.
    `SELECT a.cod_asesor, max(a.nombre) AS nombre, max(a.sede) AS sede,
            to_char(v.periodo, 'YYYY-MM') AS periodo,
            sum(v.neto)::float8 AS neto, count(*)::int AS ventas,
            count(DISTINCT v.cod_cliente)::int AS clientes
     ${desdeVentas(filtros, { asesor: true })} ${w}
     GROUP BY GROUPING SETS ((a.cod_asesor, v.periodo), (a.cod_asesor))
     ORDER BY a.cod_asesor, v.periodo`,
    params,
  );

  const porAsesor = new Map<string, FilaAsesorCruda[]>();
  for (const fila of rows) {
    porAsesor.set(fila.cod_asesor, [...(porAsesor.get(fila.cod_asesor) ?? []), fila]);
  }

  return [...porAsesor.values()]
    .map((filas) => {
      const total = filas.find((fila) => fila.periodo === null)!;
      const meses = filas.filter((fila) => fila.periodo !== null);
      return {
        codigo: total.cod_asesor,
        nombre: total.nombre,
        sede: total.sede,
        neto: total.neto,
        ventas: total.ventas,
        clientes: total.clientes,
        ticketMedio: total.neto / total.ventas,
        variacionPct: variacion(meses.at(-1)?.neto ?? 0, meses.at(-2)?.neto ?? 0),
      };
    })
    .sort((a, b) => b.neto - a.neto)
    .slice(0, limite);
};

const ORDENES_CLIENTE = {
  neto: "neto",
  ventas: "ventas",
  ultimaCompra: "ultima_compra",
  nombre: "c.nombre",
  codigo: "c.cod_cliente",
} as const;

export type OrdenCliente = keyof typeof ORDENES_CLIENTE;

export const leerOrden = (valor?: string): OrdenCliente => {
  const orden = (valor ?? "neto") as OrdenCliente;
  if (!(orden in ORDENES_CLIENTE)) {
    throw peticionInvalida(
      `"orden" debe ser uno de: ${Object.keys(ORDENES_CLIENTE).join(", ")}.`,
      { orden: valor },
    );
  }
  return orden;
};

export type ClienteListado = {
  cod_cliente: number;
  nombre: string;
  tipo: string;
  sede: string;
  asesor: string;
  neto: number;
  ventas: number;
  notas: number;
  monto_notas: number;
  ultima_compra: string;
  total: number;
};

export const listarClientes = async (
  filtros: Filtros,
  opciones: { busqueda?: string; orden: OrdenCliente; direccion: "asc" | "desc"; pagina: number; porPagina: number },
): Promise<ClienteListado[]> => {
  const { where: w, params } = where(filtros, opciones.busqueda);
  params.push(opciones.porPagina, (opciones.pagina - 1) * opciones.porPagina);
  const { rows } = await consultar<ClienteListado>(
    `SELECT c.cod_cliente, c.nombre, c.tipo, a.sede, a.cod_asesor AS asesor,
            sum(v.neto)::float8 AS neto, count(*)::int AS ventas,
            count(*) FILTER (WHERE v.neto < 0)::int AS notas,
            coalesce(sum(v.neto) FILTER (WHERE v.neto < 0), 0)::float8 AS monto_notas,
            to_char(max(v.periodo), 'YYYY-MM') AS ultima_compra,
            count(*) OVER ()::int AS total
     ${desdeVentas(filtros, { cliente: true, asesor: true })} ${w}
     GROUP BY c.cod_cliente, c.nombre, c.tipo, a.sede, a.cod_asesor
     ORDER BY ${ORDENES_CLIENTE[opciones.orden]} ${opciones.direccion.toUpperCase()},
              c.cod_cliente ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
};

export type HistorialCliente = {
  cliente: { codigo: number; nombre: string; tipo: string; sede: string; asesor: string };
  neto: number;
  ventas: number;
  notas: number;
  monto_notas: number;
  ticket_medio: number;
  primera_compra: string;
  ultima_compra: string;
  periodos: FilaPeriodo[];
  materiales: { codigo: number; nombre: string; neto: number; ventas: number }[];
};

export const historialCliente = async (codigo: number, filtros: Filtros): Promise<HistorialCliente> => {
  const cliente = await consultar<HistorialCliente["cliente"]>(
    `SELECT c.cod_cliente AS codigo, c.nombre, c.tipo, a.sede, a.cod_asesor AS asesor
     FROM clientes c
     JOIN cliente_asesor ca ON ca.cod_cliente = c.cod_cliente
     JOIN asesores a ON a.cod_asesor = ca.cod_asesor
     WHERE c.cod_cliente = $1`,
    [codigo],
  );
  const ficha = cliente.rows[0];
  if (!ficha) throw noEncontrado(`No existe el cliente ${codigo}.`);

  const todos = where(filtros);
  const [serie, materiales, resumen] = await Promise.all([
    consultar<FilaPeriodo>(
      `SELECT ${AGREGADO_MENSUAL} ${desdeVentas(filtros, { asesor: true })} ${todos.where} AND v.cod_cliente = $${todos.params.length + 1}
       GROUP BY v.periodo ORDER BY v.periodo`,
      [...todos.params, codigo],
    ),
    consultar<HistorialCliente["materiales"][number]>(
      `SELECT m.cod_material AS codigo, m.nombre, sum(v.neto)::float8 AS neto, count(*)::int AS ventas
       FROM ventas v JOIN materiales m ON m.cod_material = v.cod_material
       ${todos.where} AND v.cod_cliente = $${todos.params.length + 1}
       GROUP BY m.cod_material, m.nombre ORDER BY neto DESC LIMIT 8`,
      [...todos.params, codigo],
    ),
    consultar<{ neto: number; ventas: number; notas: number; monto_notas: number }>(
      `SELECT coalesce(sum(v.neto), 0)::float8 AS neto, count(*)::int AS ventas,
              count(*) FILTER (WHERE v.neto < 0)::int AS notas,
              coalesce(sum(v.neto) FILTER (WHERE v.neto < 0), 0)::float8 AS monto_notas
       ${desdeVentas(filtros, { asesor: true })} ${todos.where} AND v.cod_cliente = $${todos.params.length + 1}`,
      [...todos.params, codigo],
    ),
  ]);

  const periodos = serie.rows;
  const totales = resumen.rows[0];
  return {
    cliente: ficha,
    ...totales,
    ticket_medio: totales.ventas ? totales.neto / totales.ventas : 0,
    primera_compra: periodos[0]?.periodo ?? "",
    ultima_compra: periodos.at(-1)?.periodo ?? "",
    periodos,
    materiales: materiales.rows,
  };
};
