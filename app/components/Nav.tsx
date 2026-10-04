"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Headset, Package, UploadCloud, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { abrirModalUpload, usePegado } from "../lib/ui";
import FiltrosGenerales from "./dashboard/FiltrosGenerales";
import Wordmark from "./Wordmark";

export const NAV = [
  { label: "Resumen", href: "/", icon: BarChart3 },
  { label: "Asesores", href: "/asesores", icon: Headset },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Materiales", href: "/materiales", icon: Package },
];

const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const;
const MotionLink = motion.create(Link);

const PILLA = "flex h-14 items-center justify-center rounded-full bg-brand p-1.5";
const DOCK = "flex h-14 w-full max-w-sm items-center rounded-full bg-brand p-1.5";
const BARRA = "flex h-14 items-center justify-between gap-2 bg-brand px-3 sm:px-4";
// La barra fija entra y sale solo con transform: corta y sin medir layout, para
// que no "persiga" la pagina mientras se hace scroll.
const ENTRADA_BARRA = { duration: 0.18, ease: "easeOut" } as const;

type Alcance = "dock" | "top" | "barra";

export default function Nav() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);
  const pegado = usePegado();

  const items = (scope: Alcance) =>
    NAV.map((item, index) => {
      const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
      const isDock = scope === "dock";
      const Icon = item.icon;

      return (
        <motion.li
          key={item.href}
          // La entrada escalonada es solo la primera vez que carga la app: la
          // barra fija aparece y desaparece con el scroll y no debe repetirla.
          initial={scope === "barra" ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 + index * 0.06 }}
          onHoverStart={() => setHovered(item.href)}
          onHoverEnd={() => setHovered(null)}
          className={isDock ? "min-w-0 flex-1" : "min-w-0"}
        >
          <MotionLink
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            aria-label={isDock ? item.label : undefined}
            whileTap={{ scale: 0.96 }}
            className={`relative flex min-w-0 items-center justify-center rounded-full font-medium transition-colors ${
              isDock ? "h-11 w-full" : "py-2.5"
            } ${isActive ? "text-brand" : "text-background"}`}
          >
            {isActive && (
              <motion.span
                layoutId={`nav-active-${scope}`}
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-background"
              />
            )}
            {!isActive && hovered === item.href && (
              <motion.span
                layoutId={`nav-hover-${scope}`}
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-background/20"
              />
            )}

            {isDock ? (
              <span className="absolute inset-0 flex items-center justify-center overflow-hidden">
                <motion.span layout className="flex min-w-0 flex-col items-center">
                  <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="max-w-full truncate text-[0.7rem] leading-none"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>
              </span>
            ) : (
              <span className="relative block truncate px-2.5 text-[0.7rem] sm:px-4 sm:text-sm">
                {item.label}
              </span>
            )}
          </MotionLink>
        </motion.li>
      );
    });

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden"
      >
        <div className={DOCK}>
          <ul className="flex w-full items-center justify-center gap-0.5">{items("dock")}</ul>
        </div>
      </nav>

      {/* La pildora se queda siempre en su lugar: cuando sale de la pantalla
          (usePegado) aparece la barra fija de arriba, que es otro elemento. */}
      <nav aria-label="Navegación principal" className="hidden justify-center sm:flex">
        <div data-nav className={PILLA}>
          <ul className="flex w-full items-center justify-center gap-0.5">{items("top")}</ul>
        </div>
      </nav>

      <AnimatePresence>
        {pegado && (
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={ENTRADA_BARRA}
            className="fixed inset-x-0 top-0 z-40 hidden sm:block"
          >
            <nav aria-label="Navegación principal (barra fija)" className={BARRA}>
              <Wordmark className="h-4 w-auto shrink-0 text-background sm:h-5" />
              <ul className="flex min-w-0 items-center gap-0.5 sm:gap-1">{items("barra")}</ul>
              <button
                type="button"
                onClick={abrirModalUpload}
                aria-label="Cargar Excel con información maestra"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-background transition-opacity hover:opacity-70"
              >
                <UploadCloud aria-hidden="true" className="h-5 w-5" />
              </button>
            </nav>
            <div className="flex h-6 items-center bg-[#474324] px-4">
              <FiltrosGenerales oscuro compacto />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
