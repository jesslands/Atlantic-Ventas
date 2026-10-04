"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { activos, useFiltros } from "../../lib/filtros";
import EditorFiltros, { textoPeriodo, useCatalogos } from "../filtros/EditorFiltros";
import { usePopover } from "./usePopover";

const resumen = (texto: string, cantidad: number) =>
  cantidad === 1 ? texto : `${cantidad} ${texto}`;

/**
 * Filtros de escritorio: botón "Filtros", chips de lo activo y un popover
 * anclado con el mismo editor que usa el panel móvil (borrador + Aplicar).
 * `compacto`/`oscuro` es la versión de la barra fija que aparece al hacer scroll.
 */
export default function FiltrosGenerales({
  oscuro = false,
  compacto = false,
}: {
  oscuro?: boolean;
  compacto?: boolean;
}) {
  const [filtros, setFiltros, limpiar] = useFiltros();
  const [abierto, setAbierto] = useState(false);
  const contenedor = usePopover<HTMLDivElement>(abierto, setAbierto);
  const popover = useRef<HTMLDivElement>(null);
  const cantidad = activos(filtros);

  // El nombre del asesor solo hace falta para su chip cuando hay uno elegido.
  const { opcionesAsesor } = useCatalogos(filtros.asesores.length === 1);

  useEffect(() => {
    if (abierto) popover.current?.querySelector<HTMLElement>("[data-autofoco]")?.focus();
  }, [abierto]);

  const cabecera = oscuro
    ? "text-background/85 hover:text-background"
    : "text-foreground/75 hover:text-foreground";
  const textoLimpiar = oscuro
    ? "text-background/70 hover:bg-background/15"
    : "text-foreground/60 hover:bg-foreground/10";
  const chip = oscuro
    ? "bg-[#c28e4b]/35 text-background hover:bg-[#c28e4b]/50"
    : "bg-[#c28e4b]/20 text-foreground hover:bg-[#c28e4b]/35";
  const altoBoton = compacto ? "h-6 gap-1.5 px-2.5 text-[0.7rem]" : "h-11 gap-2 px-4 text-sm";
  const altoChip = compacto ? "h-5 px-2 text-[0.65rem]" : "h-8 px-3 text-xs";
  const altoLimpiar = compacto ? "h-6 px-1.5 text-[0.7rem]" : "h-11 px-3 text-sm";
  const altoContador = compacto ? "h-4 min-w-4 px-1 text-[0.6rem]" : "h-5 min-w-5 px-1.5 text-[0.7rem]";
  const icono = compacto ? "h-3.5 w-3.5" : "h-4 w-4";

  const hayPeriodo = Boolean(filtros.desde || filtros.hasta);

  return (
    <div className={`relative w-full ${compacto ? "flex items-center" : ""}`} ref={contenedor}>
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-haspopup="dialog"
          className={`relative inline-flex shrink-0 items-center gap-1.5 font-montserrat font-bold tracking-wide uppercase transition-colors ${altoBoton} ${cabecera} ${
            compacto ? "before:absolute before:-inset-y-3 before:inset-x-0 before:content-[\"\"]" : ""
          }`}
        >
          Filtros
          {cantidad > 0 && (
            <span
              className={`flex items-center justify-center rounded-full bg-[#1f1f1f] text-background ${altoContador}`}
            >
              {cantidad}
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className={`${icono} transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
          />
        </button>

        {cantidad > 0 && (
          <ul aria-label="Filtros activos" className="franja min-w-0 items-center gap-2 pr-3">
            {hayPeriodo && (
              <li className="shrink-0">
                <Badge alto={altoChip} tono={chip} onClick={() => setFiltros({ desde: undefined, hasta: undefined })}>
                  {textoPeriodo(filtros.desde, filtros.hasta)}
                </Badge>
              </li>
            )}
            {filtros.sedes.length > 0 && (
              <li className="shrink-0">
                <Badge alto={altoChip} tono={chip} onClick={() => setFiltros({ sedes: [] })}>
                  {filtros.sedes.length === 1 ? filtros.sedes[0] : resumen("sedes", filtros.sedes.length)}
                </Badge>
              </li>
            )}
            {filtros.asesores.length > 0 && (
              <li className="shrink-0">
                <Badge alto={altoChip} tono={chip} onClick={() => setFiltros({ asesores: [] })}>
                  {filtros.asesores.length === 1
                    ? (opcionesAsesor.find((o) => o.valor === filtros.asesores[0])?.texto ?? filtros.asesores[0])
                    : resumen("asesores", filtros.asesores.length)}
                </Badge>
              </li>
            )}
          </ul>
        )}

        {cantidad > 0 && (
          <button
            type="button"
            onClick={limpiar}
            className={`inline-flex shrink-0 items-center rounded-full transition-colors ${altoLimpiar} ${textoLimpiar}`}
          >
            Limpiar
          </button>
        )}
      </div>

      <AnimatePresence>
        {abierto && (
          <motion.div
            ref={popover}
            role="dialog"
            aria-labelledby="titulo-filtros-escritorio"
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top left" }}
            className="absolute top-full left-0 z-50 mt-2 flex max-h-[min(40rem,calc(100dvh-8rem))] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-plano text-foreground shadow-[0_1px_2px_rgba(87,82,44,0.08),0_24px_48px_-16px_rgba(31,31,31,0.35)] ring-1 ring-linea"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 px-4 pt-4 pb-2">
              <div>
                <h2 id="titulo-filtros-escritorio" className="text-[0.95rem] font-semibold">
                  Filtros
                </h2>
                <p className="mt-0.5 text-xs text-tinta-3">Se aplican en todas las vistas.</p>
              </div>
              <button
                data-autofoco
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar sin aplicar"
                className="-mt-1 -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-tinta-3 transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <EditorFiltros alCerrar={() => setAbierto(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Badge({
  children,
  onClick,
  tono,
  alto,
}: {
  children: string;
  onClick: () => void;
  tono: string;
  alto: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Quitar filtro"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full font-medium whitespace-nowrap transition-colors ${alto} ${tono}`}
    >
      {children}
      <X aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}
