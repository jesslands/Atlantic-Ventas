import { consultar } from "../db.ts";
import type { Filtros } from "../filtros.ts";
import { noEncontrado, peticionInvalida } from "../http.ts";
import { whereVentas } from "./ventas.ts";

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
  opciones: {
    busqueda?: string;
    orden: OrdenCliente;
    direccion: "asc" | "desc";
    pagina: number;
    porPagina: number;
  },
): Promise<ClienteListado[]> => {
  const { where: w, params } = whereVentas(filtros, opciones.busqueda);
  params.push(opciones.porPagina, (opciones.pagina - 1) * opciones.porPagina);
  const { rows } = await consultar<ClienteListado>(
    `SELECT c.cod_cliente, c.nombre, c.tipo, a.sede, a.cod_asesor AS asesor,
            sum(v.neto)::float8 AS neto, count(*)::int AS ventas,
            count(*) FILTER (WHERE v.neto < 0)::int AS notas,
            coalesce(sum(v.neto) FILTER (WHERE v.neto < 0), 0)::float8 AS monto_notas,
            to_char(max(v.periodo), 'YYYY-MM') AS ultima_compra,
            count(*) OVER ()::int AS total
     FROM ventas v
     JOIN clientes c ON c.cod_cliente = v.cod_cliente
     JOIN cliente_asesor ca ON ca.cod_cliente = v.cod_cliente
     JOIN asesores a ON a.cod_asesor = ca.cod_asesor
     ${w}
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
  periodos: Array<{ periodo: string; neto: number; ventas: number; notas: number; monto_notas: number; clientes: number; ticket_mediano: number }>;
  materiales: { codigo: number; nombre: string; neto: number; ventas: number }[];
};

export const historialCliente = async (
  codigo: number,
  filtros: Filtros,
): Promise<HistorialCliente> => {
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

  const todos = whereVentas(filtros);
  const [serie, materiales, resumen] = await Promise.all([
    consultar<HistorialCliente["periodos"][number]>(
      `SELECT to_char(v.periodo, 'YYYY-MM') AS periodo,
              sum(v.neto)::float8 AS neto,
              count(*)::int AS ventas,
              count(*) FILTER (WHERE v.neto < 0)::int AS notas,
              coalesce(sum(v.neto) FILTER (WHERE v.neto < 0), 0)::float8 AS monto_notas,
              count(DISTINCT v.cod_cliente)::int AS clientes,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY v.neto) FILTER (WHERE v.neto > 0)::float8 AS ticket_mediano
       FROM ventas v
       JOIN cliente_asesor ca ON ca.cod_cliente = v.cod_cliente
       JOIN asesores a ON a.cod_asesor = ca.cod_asesor
       ${todos.where} AND v.cod_cliente = $${todos.params.length + 1}
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
       FROM ventas v
       JOIN cliente_asesor ca ON ca.cod_cliente = v.cod_cliente
       JOIN asesores a ON a.cod_asesor = ca.cod_asesor
       ${todos.where} AND v.cod_cliente = $${todos.params.length + 1}`,
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