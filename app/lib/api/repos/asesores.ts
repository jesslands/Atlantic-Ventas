import { variacion } from "../analitica.ts";
import { consultar } from "../db.ts";
import type { Filtros } from "../filtros.ts";
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