"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Menu, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { activos, useFiltros } from "../lib/filtros";
import { abrirModalUpload } from "../lib/ui";
import EditorFiltros from "./filtros/EditorFiltros";
import Wordmark from "./Wordmark";

const DRAWER = { type: "tween", duration: 0.28, ease: [0.32, 0.72, 0, 1] } as const;

/**
 * Barra superior solo para móvil: menú de filtros a la izquierda, logo al
 * centro y carga de Excel a la derecha. La navegación entre vistas sigue en
 * el dock inferior (Nav).
 */
export default function BarraMovil() {
  const [filtros] = useFiltros();
  const [abierto, setAbierto] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);
  const cantidad = activos(filtros);

  return (
    <>
      <header className="sticky top-0 z-40 bg-brand pt-[env(safe-area-inset-top)] text-background sm:hidden">
        <div className="relative flex h-14 items-center justify-between px-2">
          <button
            ref={disparador}
            type="button"
            onClick={() => setAbierto(true)}
            aria-haspopup="dialog"
            aria-expanded={abierto}
            aria-label={cantidad ? `Filtros, ${cantidad} activos` : "Filtros"}
            className="relative flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
          >
            <Menu aria-hidden="true" className="h-6 w-6" />
            {cantidad > 0 && (
              <span className="absolute top-1.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-acento px-1 text-[0.6rem] font-semibold text-white">
                {cantidad}
              </span>
            )}
          </button>

          <Wordmark className="absolute top-1/2 left-1/2 h-7 w-auto -translate-x-1/2 -translate-y-1/2" />

          <button
            type="button"
            onClick={abrirModalUpload}
            aria-label="Cargar Excel con información maestra"
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
          >
            <UploadCloud aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {abierto && <PanelFiltros alCerrar={() => setAbierto(false)} disparador={disparador} />}
      </AnimatePresence>
    </>
  );
}

/** Panel lateral móvil: solo el contenedor (fondo, gesto, foco); el contenido es EditorFiltros. */
function PanelFiltros({
  alCerrar,
  disparador,
}: {
  alCerrar: () => void;
  disparador: RefObject<HTMLButtonElement | null>;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Bloqueo de scroll, foco inicial, Escape y foco atrapado dentro del panel.
  useEffect(() => {
    const boton = disparador.current;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("[data-autofoco]")?.focus();
    const teclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCerrar();
      if (e.key !== "Tab" || !panel.current) return;
      const focables = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex='0']");
      const primero = focables[0];
      const ultimo = focables[focables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo?.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero?.focus();
      }
    };
    document.addEventListener("keydown", teclado);
    return () => {
      document.body.style.overflow = scroll;
      document.removeEventListener("keydown", teclado);
      boton?.focus({ preventScroll: true });
    };
  }, [alCerrar, disparador]);

  // Deslizar hacia la izquierda cierra: basta con la distancia o con un gesto rápido.
  const alSoltar = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -80 || info.velocity.x < -500) alCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-foreground/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={alCerrar}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-filtros-movil"
        className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-plano pt-[env(safe-area-inset-top)] shadow-[8px_0_32px_-12px_rgba(31,31,31,0.35)]"
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%", transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] } }}
        transition={DRAWER}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0 }}
        dragDirectionLock
        onDragEnd={alSoltar}
      >
        <div className="flex h-14 shrink-0 items-center justify-between bg-brand pr-2 pl-4 text-background">
          <h2 id="titulo-filtros-movil" className="text-base font-semibold">
            Filtros
          </h2>
          <button
            data-autofoco
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar sin aplicar"
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <EditorFiltros alCerrar={alCerrar} />
      </motion.div>
    </div>
  );
}
