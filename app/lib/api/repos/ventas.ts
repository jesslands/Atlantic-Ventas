import { consultar } from "../db.ts";
import type { Filtros } from "../filtros.ts";
import { comoFecha } from "../filtros.ts";

export const whereVentas = (filtros: Filtros) => {
  const condiciones: string[] = [];
  const params: unknown[] = [];
  if (filtros.desde) condiciones.push(`v.periodo >= $${params.push(comoFecha(filtros.desde))}::date`);
  if (filtros.hasta) condiciones.push(`v.periodo <= $${params.push(comoFecha(filtros.hasta))}::date`);
  if (filtros.sedes.length)
    condiciones.push(`upper(a.sede) = ANY($${params.push(filtros.sedes)}::text[])`);
  if (filtros.asesores.length)
    condiciones.push(`a.cod_asesor = ANY($${params.push(filtros.asesores)}::text[])`);
  return { where: condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "", params };
};