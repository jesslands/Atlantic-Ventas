import { variacion } from "../analitica.ts";
import { consultar } from "../db.ts";
import type { Filtros } from "../filtros.ts";
import { noEncontrado } from "../http.ts";
import { whereVentas } from "./ventas.ts";

type FilaAsesorCruda = {
  cod_asesor: string;
  nombre: string;
  sede: string;
  periodo: string | null;
  neto: number;
  ventas: number;
  clientes: number;
};

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
  const { where: w, params } = whereVentas(filtros);
  const { rows } = await consultar<FilaAsesorCruda>(
    `SELECT a.cod_asesor, max(a.nombre) AS nombre, max(a.sede) AS sede,
            to_char(v.periodo, 'YYYY-MM') AS periodo,
            sum(v.neto)::float8 AS neto, count(*)::int AS ventas,
            count(DISTINCT v.cod_cliente)::int AS clientes
     FROM ventas v
     JOIN cliente_asesor ca ON ca.cod_cliente = v.cod_cliente
     JOIN asesores a ON a.cod_asesor = ca.cod_asesor
     ${w}
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

export type HistorialAsesor = {
  asesor: { codigo: string; nombre: string; sede: string };
  neto: number;
  ventas: number;
  notas: number;
  monto_notas: number;
  ticket_medio: number;
  periodos: Array<{ periodo: string; neto: number; ventas: number; notas: number; monto_notas: number; clientes: number }>;
  clientes: { codigo: number; nombre: string; neto: number; ventas: number }[];
};

export const historialAsesor = async (
  codigo: string,
  filtros: Filtros,
): Promise<HistorialAsesor> => {
  const ficha = await consultar<HistorialAsesor["asesor"]>(
    `SELECT cod_asesor AS codigo, nombre, sede FROM asesores WHERE cod_asesor = $1`,
    [codigo],
  );
  const asesor = ficha.rows[0];
  if (!asesor) throw noEncontrado(`No existe el asesor ${codigo}.`);

  const { where: w, params } = whereVentas(filtros);
  const [serie, clientes] = await Promise.all([
    consultar<HistorialAsesor["periodos"][number]>(
      `SELECT to_char(v.periodo, 'YYYY-MM') AS periodo,
              sum(v.neto)::float8 AS neto,
              count(*)::int AS ventas,
              count(*) FILTER (WHERE v.neto < 0)::int AS notas,
              coalesce(sum(v.neto) FILTER (WHERE v.neto < 0), 0)::float8 AS monto_notas,
              count(DISTINCT v.cod_cliente)::int AS clientes
       FROM ventas v
       JOIN cliente_asesor ca ON ca.cod_cliente = v.cod_cliente
       JOIN asesores a ON a.cod_asesor = ca.cod_asesor
       ${w} AND a.cod_asesor = $${params.length + 1}
       GROUP BY v.periodo ORDER BY v.periodo`,
      [...params, codigo],
    ),
    consultar<HistorialAsesor["clientes"][number]>(
      `SELECT c.cod_cliente AS codigo, c.nombre, sum(v.neto)::float8 AS neto, count(*)::int AS ventas
       FROM ventas v
       JOIN clientes c ON c.cod_cliente = v.cod_cliente
       JOIN cliente_asesor ca ON ca.cod_cliente = v.cod_cliente
       JOIN asesores a ON a.cod_asesor = ca.cod_asesor
       ${w} AND a.cod_asesor = $${params.length + 1}
       GROUP BY c.cod_cliente, c.nombre ORDER BY neto DESC LIMIT 10`,
      [...params, codigo],
    ),
  ]);

  const periodos = serie.rows;
  const neto = periodos.reduce((suma, fila) => suma + fila.neto, 0);
  const ventas = periodos.reduce((suma, fila) => suma + fila.ventas, 0);
  const notas = periodos.reduce((suma, fila) => suma + fila.notas, 0);
  const montoNotas = periodos.reduce((suma, fila) => suma + fila.monto_notas, 0);

  return {
    asesor,
    neto,
    ventas,
    notas,
    monto_notas: montoNotas,
    ticket_medio: ventas ? neto / ventas : 0,
    periodos,
    clientes: clientes.rows,
  };
};