"use client";

import { useSyncExternalStore } from "react";
import { filtrosVacios, type Filtros } from "./analytics";
import { PERIODOS, type DatosDemo, datosDemo } from "./mockSales";

const CLAVE = "atlantic:filtros";

const listeners = new Set<() => void>();
let estado: Filtros = filtrosVacios;

const sanear = (guardado: Partial<Filtros> | null, datos: DatosDemo): Filtros => ({
  periodos: (guardado?.periodos ?? []).filter((p) => PERIODOS.includes(p)),
  materiales: (guardado?.materiales ?? []).filter((m) =>
    datos.materiales.some((material) => material.codigo === m),
  ),
  sedes: (guardado?.sedes ?? []).filter((s) =>
    datos.sedes.some((sede) => sede.sede === s),
  ),
});

if (typeof window !== "undefined") {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (crudo) estado = sanear(JSON.parse(crudo) as Partial<Filtros>, datosDemo());
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
    estado = sanear({ ...estado, ...parcial }, datosDemo());
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

export const activos = (filtros: Filtros) =>
  filtros.periodos.length + filtros.materiales.length + filtros.sedes.length;
