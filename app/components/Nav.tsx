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
const BARRA =
  "fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-2 bg-brand px-3 sm:px-4";

export default function Nav() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);
  const pegado = usePegado();

  const items = (scope: "dock" | "top", esDock: boolean) =>
    NAV.map((item, index) => {
      const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
      const isDock = esDock;
      const Icon = item.icon;

      return (
        <motion.li
          key={item.href}
          initial={{ opacity: 0, y: 8 }}
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
            layout
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

  // en móvil la navegación es el hub de abajo: solo el navbar de escritorio se transforma
  const navegacion = (scope: "dock" | "top") => {
    const pegadoArriba = scope === "top" && pegado;
    const esDock = scope === "dock";

    return (
    <motion.div
      layout
      transition={SPRING}
      className={
        pegadoArriba
          ? BARRA
          : esDock
            ? "flex h-14 w-full max-w-sm items-center rounded-full bg-brand p-1.5"
            : PILLA
      }
    >
      {pegadoArriba && (
        <Wordmark className="h-4 w-auto shrink-0 text-background sm:h-5" />
      )}

      <ul
        className={`flex items-center ${
          pegadoArriba ? "min-w-0 gap-0.5 sm:gap-1" : "w-full justify-center gap-0.5"
        }`}
      >
        {items(scope, esDock)}
      </ul>

      {pegadoArriba && (
        <button
          type="button"
          onClick={abrirModalUpload}
          aria-label="Cargar Excel con información maestra"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-background transition-opacity hover:opacity-70"
        >
          <UploadCloud aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
    </motion.div>
    );
  };

  return (
    <>
      <motion.nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden"
      >
        {navegacion("dock")}
      </motion.nav>

      <motion.nav
        aria-label="Navegación principal"
        className="hidden justify-center sm:flex"
      >
        <div data-nav className="h-14">
          {navegacion("top")}
        </div>
      </motion.nav>

      <AnimatePresence>
        {pegado && (
          <motion.div
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-x-0 top-14 z-40 hidden h-6 items-center sm:flex"
          >
            <div className="w-full bg-[#474324] px-4">
              <FiltrosGenerales oscuro compacto />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
