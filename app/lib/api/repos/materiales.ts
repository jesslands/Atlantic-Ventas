import { consultar } from "../db.ts";
import type { Filtros } from "../filtros.ts";
import { noEncontrado, peticionInvalida } from "../http.ts";
import { whereVentas } from "./ventas.ts";

/** Ventas con material, cliente y asesor: los filtros de sede/asesor necesitan `a`. */
const DESDE = `FROM ventas v
     JOIN materiales m ON m.cod_material = v.cod_material
     JOIN clientes c ON c.cod_cliente = v.cod_cliente
     JOIN cliente_asesor ca ON ca.cod_cliente = v.cod_cliente
     JOIN asesores a ON a.cod_asesor = ca.cod_asesor`;

/** WHERE de los filtros generales más condiciones propias, con parámetros numerados. */
const donde = (filtros: Filtros, extra: (params: unknown[]) => string[], busqueda?: string) => {
  const { where, params } = whereVentas(filtros);
  const condiciones = extra(params);
  if (busqueda) condiciones.push(`strpos(lower(m.nombre), lower($${params.push(busqueda)})) > 0`);
  const todas = [where.replace(/^WHERE /, ""), ...condiciones].filter(Boolean);
  return { sql: todas.length ? `WHERE ${todas.join(" AND ")}` : "", params };
};

export type FilaCategoria = {
  categoria: string;
  neto: number;
  ventas: number;
  clientes: number;
  materiales: number;
  participacion: number;
};

export const listarCategorias = async (filtros: Filtros): Promise<FilaCategoria[]> => {
  const { sql, params } = donde(filtros, () => []);
  const { rows } = await consultar<FilaCategoria>(
    `SELECT m.categoria, sum(v.neto)::float8 AS neto, count(*)::int AS ventas,
            count(DISTINCT v.cod_cliente)::int AS clientes,
            count(DISTINCT v.cod_material)::int AS materiales,
            coalesce(sum(v.neto) * 100 / nullif(sum(sum(v.neto)) OVER (), 0), 0)::float8 AS participacion
     ${DESDE} ${sql}
     GROUP BY m.categoria ORDER BY neto DESC`,
    params,
  );
  return rows;
};

const ORDENES_MATERIAL = {
  neto: "neto",
  ventas: "ventas",
  clientes: "clientes",
  nombre: "m.nombre",
  codigo: "m.cod_material",
} as const;

export type OrdenMaterial = keyof typeof ORDENES_MATERIAL;

export const leerOrdenMaterial = (valor?: string): OrdenMaterial => {
  const orden = (valor ?? "neto") as OrdenMaterial;
  // Lista blanca con Object.hasOwn, como leerOrden de clientes (PT-02).
  if (!Object.hasOwn(ORDENES_MATERIAL, orden)) {
    throw peticionInvalida(
      `"orden" debe ser uno de: ${Object.keys(ORDENES_MATERIAL).join(", ")}.`,
      { orden: valor },
    );
  }
  return orden;
};

export type MaterialListado = {
  cod_material: number;
  nombre: string;
  categoria: string | null;
  subcategoria: string | null;
  marca: string | null;
  neto: number;
  ventas: number;
  clientes: number;
  total: number;
};

export const listarMateriales = async (
  filtros: Filtros,
  opciones: {
    busqueda?: string;
    categoria?: string;
    orden: OrdenMaterial;
    direccion: "asc" | "desc";
    pagina: number;
    porPagina: number;
  },
): Promise<MaterialListado[]> => {
  const { sql, params } = donde(
    filtros,
    (p) => (opciones.categoria ? [`upper(m.categoria) = $${p.push(opciones.categoria)}`] : []),
    opciones.busqueda,
  );
  params.push(opciones.porPagina, (opciones.pagina - 1) * opciones.porPagina);
  const { rows } = await consultar<MaterialListado>(
    `SELECT m.cod_material, m.nombre, m.categoria, m.subcategoria, m.marca,
            sum(v.neto)::float8 AS neto, count(*)::int AS ventas,
            count(DISTINCT v.cod_cliente)::int AS clientes,
            count(*) OVER ()::int AS total
     ${DESDE} ${sql}
     GROUP BY m.cod_material, m.nombre, m.categoria, m.subcategoria, m.marca
     ORDER BY ${ORDENES_MATERIAL[opciones.orden]} ${opciones.direccion.toUpperCase()}, m.cod_material ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
};

type Ficha = {
  neto: number;
  ventas: number;
  clientes: number;
  notas: number;
  monto_notas: number;
  ticket_medio: number;
  anios: { anio: string; neto: number; ventas: number }[];
  periodos: { periodo: string; neto: number; ventas: number; clientes: number }[];
  top_clientes: { codigo: number; nombre: string; tipo: string; sede: string; neto: number; ventas: number }[];
};

/** Totales, año, mes a mes y principales clientes de un recorte de ventas (`condicion`). */
const fichaDe = async (filtros: Filtros, condicion: (params: unknown[]) => string): Promise<Ficha> => {
  const consulta = <T extends Record<string, unknown>>(texto: (where: string) => string) => {
    const { sql, params } = donde(filtros, (p) => [condicion(p)]);
    return consultar<T>(texto(sql), params);
  };

  const [totales, anios, periodos, clientes] = await Promise.all([
    consulta<Omit<Ficha, "anios" | "periodos" | "top_clientes" | "ticket_medio">>(
      (w) => `SELECT coalesce(sum(v.neto), 0)::float8 AS neto, count(*)::int AS ventas,
                     count(DISTINCT v.cod_cliente)::int AS clientes,
                     count(*) FILTER (WHERE v.neto < 0)::int AS notas,
                     coalesce(sum(v.neto) FILTER (WHERE v.neto < 0), 0)::float8 AS monto_notas
              ${DESDE} ${w}`,
    ),
    consulta<Ficha["anios"][number]>(
      (w) => `SELECT to_char(v.periodo, 'YYYY') AS anio, sum(v.neto)::float8 AS neto, count(*)::int AS ventas
              ${DESDE} ${w} GROUP BY 1 ORDER BY 1`,
    ),
    consulta<Ficha["periodos"][number]>(
      (w) => `SELECT to_char(v.periodo, 'YYYY-MM') AS periodo, sum(v.neto)::float8 AS neto,
                     count(*)::int AS ventas, count(DISTINCT v.cod_cliente)::int AS clientes
              ${DESDE} ${w} GROUP BY v.periodo ORDER BY v.periodo`,
    ),
    consulta<Ficha["top_clientes"][number]>(
      (w) => `SELECT c.cod_cliente AS codigo, c.nombre, c.tipo, a.sede,
                     sum(v.neto)::float8 AS neto, count(*)::int AS ventas
              ${DESDE} ${w}
              GROUP BY c.cod_cliente, c.nombre, c.tipo, a.sede
              ORDER BY neto DESC, c.cod_cliente ASC LIMIT 10`,
    ),
  ]);

  const t = totales.rows[0];
  return {
    ...t,
    ticket_medio: t.ventas ? t.neto / t.ventas : 0,
    anios: anios.rows,
    periodos: periodos.rows,
    top_clientes: clientes.rows,
  };
};

export type FichaMaterial = Ficha & {
  material: {
    codigo: number;
    nombre: string;
    categoria: string | null;
    subcategoria: string | null;
    producto_base: string | null;
    presentacion: string | null;
    formato: string | null;
    calidad: string | null;
    marca: string | null;
  };
};

export const fichaMaterial = async (codigo: number, filtros: Filtros): Promise<FichaMaterial> => {
  const { rows } = await consultar<FichaMaterial["material"]>(
    `SELECT cod_material AS codigo, nombre, categoria, subcategoria, producto_base,
            presentacion, formato, calidad, marca
     FROM materiales WHERE cod_material = $1`,
    [codigo],
  );
  const material = rows[0];
  if (!material) throw noEncontrado(`No existe el material ${codigo}.`);
  const ficha = await fichaDe(filtros, (p) => `v.cod_material = $${p.push(codigo)}`);
  return { material, ...ficha };
};

export type FichaCategoria = Ficha & {
  categoria: string;
  materiales: number;
  subcategorias: { subcategoria: string; neto: number; ventas: number }[];
  top_materiales: { codigo: number; nombre: string; subcategoria: string | null; neto: number; ventas: number }[];
};

export const fichaCategoria = async (nombre: string, filtros: Filtros): Promise<FichaCategoria> => {
  const { rows } = await consultar<{ categoria: string; materiales: number }>(
    `SELECT categoria, count(*)::int AS materiales FROM materiales
     WHERE upper(categoria) = $1 GROUP BY categoria`,
    [nombre.toUpperCase()],
  );
  const encontrada = rows[0];
  if (!encontrada) throw noEncontrado(`No existe la categoría ${nombre}.`);

  const condicion = (p: unknown[]) => `m.categoria = $${p.push(encontrada.categoria)}`;
  const recorte = () => donde(filtros, (p) => [condicion(p)]);

  const [ficha, subcategorias, materiales] = await Promise.all([
    fichaDe(filtros, condicion),
    (() => {
      const { sql, params } = recorte();
      return consultar<FichaCategoria["subcategorias"][number]>(
        `SELECT coalesce(m.subcategoria, 'Sin subcategoría') AS subcategoria,
                sum(v.neto)::float8 AS neto, count(*)::int AS ventas
         ${DESDE} ${sql} GROUP BY 1 ORDER BY neto DESC`,
        params,
      );
    })(),
    (() => {
      const { sql, params } = recorte();
      return consultar<FichaCategoria["top_materiales"][number]>(
        `SELECT m.cod_material AS codigo, m.nombre, m.subcategoria,
                sum(v.neto)::float8 AS neto, count(*)::int AS ventas
         ${DESDE} ${sql}
         GROUP BY m.cod_material, m.nombre, m.subcategoria
         ORDER BY neto DESC, m.cod_material ASC LIMIT 10`,
        params,
      );
    })(),
  ]);

  return {
    categoria: encontrada.categoria,
    materiales: encontrada.materiales,
    ...ficha,
    subcategorias: subcategorias.rows,
    top_materiales: materiales.rows,
  };
};
