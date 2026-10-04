import { consultar } from "../db.ts";
import type { Filtros } from "../filtros.ts";
import { comoFecha, moverPeriodo } from "../filtros.ts";
import { variacion, type FilaPeriodo } from "../analitica.ts";

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

export const whereVentas = (filtros: Filtros, busqueda?: string) => {
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
  const { where: w, params } = whereVentas(filtros);
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
  ceros: number;
  atipicos: number;
};

export type Kpis = ResumenKpi & {
  pct_devoluciones: number;
  variacion_vs_mes_anterior: { mes: string; mes_anterior: string; pct: number } | null;
};

export const kpis = async (filtros: Filtros): Promise<Kpis> => {
  const { where: w, params } = whereVentas(filtros);
  const desdeSerie = filtros.desde ? moverPeriodo(filtros.desde, -1) : filtros.desde;
  const [resumen, serie] = await Promise.all([
    consultar<ResumenKpi>(
      `SELECT coalesce(sum(v.neto), 0)::float8 AS venta_neta,
            coalesce(sum(v.neto) FILTER (WHERE v.neto > 0), 0)::float8 AS venta_bruta,
            count(*)::int AS transacciones,
            count(DISTINCT v.cod_cliente) FILTER (WHERE v.neto > 0)::int AS clientes_activos,
            coalesce(avg(v.neto), 0)::float8 AS ticket_promedio,
            count(*) FILTER (WHERE v.neto < 0)::int AS notas_credito,
            coalesce(sum(v.neto) FILTER (WHERE v.neto < 0), 0)::float8 AS monto_notas,
            count(*) FILTER (WHERE v.neto = 0)::int AS ceros,
            count(*) FILTER (WHERE v.neto > 1000000)::int AS atipicos
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
  const { where: w, params } = whereVentas(filtros);
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