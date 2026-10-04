"use client";

import { useEffect, useState } from "react";

/**
 * Espejo cliente del `Filtros` de `app/lib/api/filtros.ts`. Mismo contrato que
 * acepta cada endpoint: `desde`/`hasta` son un rango (no una lista de periodos
 * sueltos), `sedes`/`asesores` son listas de códigos tal como los devuelve la
 * propia API (sede en mayúsculas, asesor como ASE-###).
 */
export type Filtros = {
  desde?: string;
  hasta?: string;
  sedes: string[];
  asesores: string[];
};

export const filtrosVacios: Filtros = { sedes: [], asesores: [] };

export const activos = (filtros: Filtros) =>
  (filtros.desde ? 1 : 0) + (filtros.hasta ? 1 : 0) + filtros.sedes.length + filtros.asesores.length;

/** Los únicos 6 periodos que trae hoy el pipeline de ingesta (ver README). */
export const PERIODOS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

export const filtrosAQuery = (
  filtros: Filtros,
  extra?: Record<string, string | number | undefined>,
) => {
  const params = new URLSearchParams();
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  if (filtros.sedes.length) params.set("sede", filtros.sedes.join(","));
  if (filtros.asesores.length) params.set("asesor", filtros.asesores.join(","));
  for (const [clave, valor] of Object.entries(extra ?? {})) {
    if (valor !== undefined && valor !== "") params.set(clave, String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : "";
};

export type ErrorApi = { codigo: string; mensaje: string; detalles?: Record<string, unknown> };

export type Kpis = {
  venta_neta: number;
  venta_bruta: number;
  transacciones: number;
  clientes_activos: number;
  ticket_promedio: number;
  notas_credito: number;
  monto_notas: number;
  ceros: number;
  atipicos: number;
  pct_devoluciones: number;
  variacion_vs_mes_anterior: { mes: string; mes_anterior: string; pct: number } | null;
};

export type PuntoTendencia = {
  periodo: string;
  real: number | null;
  proyeccion: number | null;
  ventas: number | null;
  notas: number | null;
  montoNotas: number | null;
  clientes: number | null;
  ticketMediano: number | null;
};

export type FilaSede = {
  sede: string;
  neto: number;
  ventas: number;
  clientes: number;
  participacion: number;
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

export type FichaAsesor = {
  asesor: { codigo: string; nombre: string; sede: string };
  neto: number;
  ventas: number;
  notas: number;
  monto_notas: number;
  ticket_medio: number;
  periodos: Array<{ periodo: string; neto: number; ventas: number; notas: number; monto_notas: number; clientes: number }>;
  clientes: { codigo: number; nombre: string; neto: number; ventas: number }[];
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
};

export type FichaCliente = {
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
  categorias: { categoria: string; neto: number; ventas: number }[];
};

export type FilaCategoria = {
  categoria: string;
  neto: number;
  ventas: number;
  clientes: number;
  materiales: number;
  participacion: number;
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
};

/** Lo común a las fichas de material y de categoría. */
export type FichaVentas = {
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

export type FichaMaterial = FichaVentas & {
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

export type FichaCategoria = FichaVentas & {
  categoria: string;
  materiales: number;
  subcategorias: { subcategoria: string; neto: number; ventas: number }[];
  top_materiales: { codigo: number; nombre: string; subcategoria: string | null; neto: number; ventas: number }[];
};

/** Una línea del historial: la compra de un material en un mes. */
export type Compra = {
  periodo: string;
  cod_material: number;
  material: string;
  categoria: string | null;
  neto: number;
  nota_credito: boolean;
};

type EstadoApi<T> = { datos: T | null; cargando: boolean; error: string | null };

/**
 * fetch + loading + error para una ruta de `/api`. `ruta === null` significa
 * "todavía no hay nada que pedir" (por ejemplo, ningún código de cliente
 * seleccionado): no dispara petición y deja `datos` en null.
 */
type Resultado<T> = { ruta: string; datos: T | null; error: string | null };

/**
 * `conservar`: mientras llega la respuesta de una ruta nueva (p. ej. cambió un
 * filtro) devuelve los datos de la anterior con `cargando: true`, para que la
 * vista se atenúe en lugar de volver al esqueleto. No usar cuando la ruta
 * cambia de entidad (fichas), porque mostraría la ficha equivocada.
 */
export function useApi<T>(ruta: string | null, { conservar = false } = {}): EstadoApi<T> {
  // `cargando` se deriva comparando `resultado.ruta` contra `ruta` (no se "setea"
  // al entrar al efecto): el único setState vive dentro del callback async del
  // fetch, que es justo el caso que permite la regla de hooks.
  const [resultado, setResultado] = useState<Resultado<T> | null>(null);

  useEffect(() => {
    if (!ruta) return;
    const controlador = new AbortController();

    fetch(ruta, { signal: controlador.signal })
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null);
        if (!respuesta.ok) {
          const error = cuerpo?.error as ErrorApi | undefined;
          throw new Error(error?.mensaje ?? `Error inesperado (${respuesta.status}).`);
        }
        setResultado({ ruta, datos: cuerpo as T, error: null });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResultado({
          ruta,
          datos: null,
          error: error instanceof Error ? error.message : "No se pudo conectar con la API.",
        });
      });

    return () => controlador.abort();
  }, [ruta]);

  if (!ruta) return { datos: null, cargando: false, error: null };
  if (!resultado || resultado.ruta !== ruta) {
    return { datos: conservar ? (resultado?.datos ?? null) : null, cargando: true, error: null };
  }
  return { datos: resultado.datos, cargando: false, error: resultado.error };
}
