"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { activos, useFiltros } from "../lib/filtros";
import { abrirModalUpload } from "../lib/ui";
import { CamposFiltros, useCatalogos } from "./dashboard/FiltrosGenerales";
import Wordmark from "./Wordmark";

const DRAWER = { type: "tween", duration: 0.28, ease: [0.32, 0.72, 0, 1] } as const;

/**
 * Barra superior solo para móvil: menú de filtros a la izquierda, logo al
 * centro y carga de Excel a la derecha. La navegación entre vistas sigue en
 * el dock inferior (Nav).
 */
export default function BarraMovil() {
  const [filtros, , limpiar] = useFiltros();
  const [abierto, setAbierto] = useState(false);
  const cerrar = useRef<HTMLButtonElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const { opcionesSede, opcionesAsesor } = useCatalogos(abierto);
  const cantidad = activos(filtros);

  useEffect(() => {
    if (!abierto) return;
    const boton = disparador.current;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrar.current?.focus();
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = scroll;
      document.removeEventListener("keydown", escape);
      boton?.focus({ preventScroll: true });
    };
  }, [abierto]);

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
        {abierto && (
          <div className="fixed inset-0 z-50 sm:hidden">
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 bg-foreground/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setAbierto(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-filtros-movil"
              className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[8px_0_32px_-12px_rgba(31,31,31,0.35)]"
              initial={{ transform: "translateX(-100%)" }}
              animate={{ transform: "translateX(0%)" }}
              exit={{ transform: "translateX(-100%)", transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] } }}
              transition={DRAWER}
            >
              <div className="flex h-14 items-center justify-between bg-brand pr-2 pl-4 text-background">
                <h2 id="titulo-filtros-movil" className="text-base font-semibold">
                  Filtros
                </h2>
                <button
                  ref={cerrar}
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar filtros"
                  className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-4 text-sm text-tinta-2">Se aplican en Resumen, Asesores y Clientes.</p>
                <CamposFiltros opcionesSede={opcionesSede} opcionesAsesor={opcionesAsesor} />
              </div>

              <div className="flex gap-2 border-t border-foreground/10 p-4">
                <button
                  type="button"
                  onClick={limpiar}
                  disabled={!cantidad}
                  className="h-11 flex-1 rounded-full border border-foreground/15 text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-40"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="h-11 flex-[2] rounded-full bg-brand text-sm font-medium text-background transition-transform active:scale-[0.98]"
                >
                  Ver resultados
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
