"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Boxes, Building2, Headset, ShoppingCart, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { appReady } from "./Preloader";

const NAV = [
  { label: "Ventas", href: "/", icon: ShoppingCart },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Materiales", href: "/materiales", icon: Boxes },
  { label: "Asesores", href: "/asesores", icon: Headset },
  { label: "Sedes", href: "/sedes", icon: Building2 },
];

const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const;

const MotionLink = motion.create(Link);

export default function Nav() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);
  const isReady = useSyncExternalStore(
    appReady.subscribe,
    appReady.get,
    () => false,
  );

  const items = (scope: "dock" | "top") =>
    NAV.map((item, index) => {
      const isActive = pathname === item.href;
      const isDock = scope === "dock";
      const Icon = item.icon;

      return (
        <motion.li
          key={item.href}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: isReady ? 1 : 0, y: isReady ? 0 : 8 }}
          transition={{ duration: 0.3, delay: 0.12 + index * 0.06 }}
          onHoverStart={() => setHovered(item.href)}
          onHoverEnd={() => setHovered(null)}
          className={isDock ? "flex-1" : undefined}
        >
          <MotionLink
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            aria-label={isDock ? item.label : undefined}
            whileTap={{ scale: 0.96 }}
            className={`relative flex items-center justify-center rounded-full font-medium transition-colors ${
              isActive ? "text-brand" : "text-background"
            } ${isDock ? "h-11 w-full" : "text-sm"}`}
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
              <span className="absolute inset-0 flex items-center justify-center">
                <motion.span layout className="flex flex-col items-center">
                  <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="text-[0.7rem] leading-none whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>
              </span>
            ) : (
              <span className="relative block px-4 py-2.5">{item.label}</span>
            )}
          </MotionLink>
        </motion.li>
      );
    });

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: isReady ? 1 : 0, y: isReady ? 0 : 16 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden"
      >
        <ul className="flex w-full max-w-sm items-center gap-0.5 rounded-full bg-brand p-1">
          {items("dock")}
        </ul>
      </motion.nav>

      <motion.nav
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: isReady ? 1 : 0, y: isReady ? 0 : 16 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        aria-label="Navegación principal"
        className="hidden justify-center sm:flex"
      >
        <ul className="flex items-center gap-1 whitespace-nowrap rounded-full bg-brand p-1.5">
          {items("top")}
        </ul>
      </motion.nav>
    </>
  );
}
