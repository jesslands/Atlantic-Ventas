"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import Logo from "./Logo";
import Wordmark from "./Wordmark";

const EXIT_MS = 900;
const MIN_VISIBLE_MS = 700;

const readyListeners = new Set<() => void>();
let isAppReady = false;

export const appReady = {
  subscribe(listener: () => void) {
    readyListeners.add(listener);
    return () => readyListeners.delete(listener);
  },
  get: () => isAppReady,
  set: () => {
    isAppReady = true;
    readyListeners.forEach((listener) => listener());
  },
};

export default function Preloader() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const leave = () => {
      timer = setTimeout(
        () => setLeaving(true),
        Math.max(0, MIN_VISIBLE_MS - (performance.now() - started)),
      );
    };
    if (document.readyState === "complete") leave();
    else window.addEventListener("load", leave, { once: true });
    return () => {
      window.removeEventListener("load", leave);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => {
      setGone(true);
      appReady.set();
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  if (gone) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div
        className={`absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 sm:w-60 ${
          leaving ? "loader-exit" : ""
        }`}
      >
        <div className="aspect-[252.74/63.49] w-full" />
        <AnimatePresence>
          {leaving ? (
            <motion.div
              key="wordmark"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Wordmark className="h-full w-full" />
            </motion.div>
          ) : (
            <motion.div
              key="stacked"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1.6 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <Logo className="logo-draw h-auto w-full" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
