"use client";

import { useEffect, useRef, type RefObject } from "react";

export function usePopover<T extends HTMLElement>(
  abierto: boolean,
  setAbierto: (abierto: boolean) => void,
) {
  const contenedor = useRef<T>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (event: MouseEvent) => {
      if (!contenedor.current?.contains(event.target as Node)) setAbierto(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto, setAbierto]);

  return contenedor as RefObject<T | null>;
}
