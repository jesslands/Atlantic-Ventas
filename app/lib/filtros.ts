"use client";

import { useSyncExternalStore } from "react";
import { activos, filtrosVacios, PERIODOS, type Filtros } from "./apiClient";

const CLAVE = "atlantic:filtros";
const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ASESOR_RE = /^ASE-\d{3}$/;
const SEDE_RE = /^[A-ZÁÉÍÓÚÑ0-9 ._-]{1,60}$/;

const listeners = new Set<() => void>();
let estado: Filtros = filtrosVacios;

/** Validación estructural (formato), no contra un catálogo vivo: un valor
 * obsoleto que ya no exista en la base simplemente no matchea nada en la API,
 * no rompe la UI. */
const sanear = (guardado: Partial<Filtros> | null): Filtros => ({
  desde: guardado?.desde && PERIODO_RE.test(guardado.desde) ? guardado.desde : undefined,
  hasta: guardado?.hasta && PERIODO_RE.test(guardado.hasta) ? guardado.hasta : undefined,
  sedes: (guardado?.sedes ?? []).filter((s) => SEDE_RE.test(s)),
  asesores: (guardado?.asesores ?? []).filter((a) => ASESOR_RE.test(a)),
});

if (typeof window !== "undefined") {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (crudo) estado = sanear(JSON.parse(crudo) as Partial<Filtros>);
  } catch {
    estado = filtrosVacios;
  }
}

const persistir = () => {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch {
    // modo privado o cuota llena: los filtros siguen vivos en memoria
  }
};

export const filtrosStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => estado,
  set(parcial: Partial<Filtros>) {
    estado = sanear({ ...estado, ...parcial });
    persistir();
    listeners.forEach((listener) => listener());
  },
  limpiar() {
    estado = filtrosVacios;
    persistir();
    listeners.forEach((listener) => listener());
  },
};

export const useFiltros = () => [
  useSyncExternalStore(filtrosStore.subscribe, filtrosStore.get, () => filtrosVacios),
  filtrosStore.set,
  filtrosStore.limpiar,
] as const;

export { activos, PERIODOS };
export type { Filtros };
