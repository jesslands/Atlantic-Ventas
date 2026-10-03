"use client";

import { useSyncExternalStore } from "react";

const UMBRAL_SIN_NAV = 120;

function crearBooleano(inicial: boolean) {
  const oyentes = new Set<() => void>();
  let valor = inicial;
  return {
    subscribe(oyente: () => void) {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
      };
    },
    get: () => valor,
    set(nuevo: boolean) {
      if (nuevo === valor) return;
      valor = nuevo;
      oyentes.forEach((oyente) => oyente());
    },
  };
}

const modalUpload = crearBooleano(false);

export const useModalUpload = () => [
  useSyncExternalStore(modalUpload.subscribe, modalUpload.get, () => false),
  modalUpload.set,
] as const;

export const abrirModalUpload = () => modalUpload.set(true);

const navVisible = (() => {
  const oyentes = new Set<() => void>();
  let visible = true;
  let pendiente = 0;

  const evaluar = () => {
    pendiente = 0;
    const ancla = [...document.querySelectorAll("[data-nav]")].find(
      (el) => el.getClientRects().length > 0,
    );
    // en móvil la navegación vive en el dock fijo: basta con haber bajado un poco
    const siguiente = ancla
      ? ancla.getBoundingClientRect().bottom > 0
      : window.scrollY < UMBRAL_SIN_NAV;
    if (siguiente === visible) return;
    visible = siguiente;
    oyentes.forEach((o) => o());
  };

  const alScroll = () => {
    if (!pendiente) pendiente = requestAnimationFrame(evaluar);
  };

  return {
    subscribe(oyente: () => void) {
      oyentes.add(oyente);
      if (oyentes.size === 1) {
        window.addEventListener("scroll", alScroll, { passive: true });
        evaluar();
      }
      return () => {
        oyentes.delete(oyente);
        if (!oyentes.size) {
          window.removeEventListener("scroll", alScroll);
          cancelAnimationFrame(pendiente);
          pendiente = 0;
        }
      };
    },
    get: () => visible,
    set(nuevo: boolean) {
      if (nuevo === visible) return;
      visible = nuevo;
      oyentes.forEach((o) => o());
    },
  };
})();

export const usePegado = () =>
  !useSyncExternalStore(navVisible.subscribe, navVisible.get, () => true);
