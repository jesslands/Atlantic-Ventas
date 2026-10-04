"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Check, Menu, Search, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { mesCorto } from "../lib/analytics";
import { filtrosVacios } from "../lib/apiClient";
import { activos, PERIODOS, useFiltros, type Filtros } from "../lib/filtros";
import { abrirModalUpload } from "../lib/ui";
import { useCatalogos } from "./dashboard/FiltrosGenerales";
import Wordmark from "./Wordmark";

const DRAWER = { type: "tween", duration: 0.28, ease: [0.32, 0.72, 0, 1] } as const;
const titular = (texto: string) => texto.charAt(0) + texto.slice(1).toLowerCase();

const mismaLista = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const iguales = (a: Filtros, b: Filtros) =>
  a.desde === b.desde && a.hasta === b.hasta && mismaLista(a.sedes, b.sedes) && mismaLista(a.asesores, b.asesores);

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

/**
 * Panel lateral de filtros. Trabaja sobre un borrador: el tablero solo se
 * recalcula al tocar "Aplicar"; cerrar sin aplicar descarta los cambios.
 */
function PanelFiltros({
  alCerrar,
  disparador,
}: {
  alCerrar: () => void;
  disparador: RefObject<HTMLButtonElement | null>;
}) {
  const [filtros, setFiltros] = useFiltros();
  const [borrador, setBorrador] = useState<Filtros>(filtros);
  const [busqueda, setBusqueda] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const franja = useRef<HTMLUListElement>(null);
  const { opcionesSede, opcionesAsesor } = useCatalogos(true);

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

  const cambiar = (parcial: Partial<Filtros>) => setBorrador((b) => ({ ...b, ...parcial }));

  // --- Periodo: dos toques definen el rango (inicio y fin). ---
  const idx = (p?: string) => (p ? PERIODOS.indexOf(p) : -1);
  const desde = idx(borrador.desde);
  const hasta = idx(borrador.hasta);
  const tocarMes = (i: number) => {
    const mes = PERIODOS[i];
    if (desde >= 0 && desde === hasta && i !== desde) {
      cambiar({ desde: PERIODOS[Math.min(i, desde)], hasta: PERIODOS[Math.max(i, desde)] });
    } else {
      cambiar({ desde: mes, hasta: mes });
    }
  };
  const ultimo = PERIODOS.length - 1;
  const atajos = [
    { texto: "Todo", desde: undefined, hasta: undefined },
    { texto: "Último mes", desde: PERIODOS[ultimo], hasta: PERIODOS[ultimo] },
    { texto: "Últimos 3 meses", desde: PERIODOS[ultimo - 2], hasta: PERIODOS[ultimo] },
  ];
  const rangoTexto =
    desde < 0 && hasta < 0
      ? "Todo el periodo"
      : desde === hasta
        ? `Solo ${mesCorto(PERIODOS[desde])} ${PERIODOS[desde].slice(0, 4)}`
        : `${mesCorto(PERIODOS[Math.max(desde, 0)])} a ${mesCorto(PERIODOS[hasta < 0 ? ultimo : hasta])} ${PERIODOS[ultimo].slice(0, 4)}`;

  // --- Sede: al elegir sedes se quitan los asesores de otras sedes. ---
  const sedeDe = new Map(opcionesAsesor.map((a) => [a.valor, a.detalle?.toUpperCase()]));
  const alternarSede = (sede: string) =>
    setBorrador((b) => {
      const sedes = b.sedes.includes(sede) ? b.sedes.filter((s) => s !== sede) : [...b.sedes, sede];
      const asesores = sedes.length ? b.asesores.filter((a) => sedes.includes(sedeDe.get(a) ?? "")) : b.asesores;
      return { ...b, sedes, asesores };
    });

  // --- Asesor: lista en línea, acotada a las sedes elegidas y con buscador. ---
  const asesoresVisibles = opcionesAsesor
    .filter((a) => !borrador.sedes.length || borrador.sedes.includes(a.detalle?.toUpperCase() ?? ""))
    .filter((a) => `${a.texto} ${a.detalle ?? ""}`.toLowerCase().includes(busqueda.trim().toLowerCase()));
  const alternarAsesor = (codigo: string) =>
    cambiar({
      asesores: borrador.asesores.includes(codigo)
        ? borrador.asesores.filter((a) => a !== codigo)
        : [...borrador.asesores, codigo],
    });
  const nombreAsesor = (codigo: string) => opcionesAsesor.find((a) => a.valor === codigo)?.texto ?? codigo;

  const cantidad = activos(borrador);
  const sinCambios = iguales(borrador, filtros);
  const aplicar = () => {
    setFiltros({ desde: borrador.desde, hasta: borrador.hasta, sedes: borrador.sedes, asesores: borrador.asesores });
    alCerrar();
  };

  const chipsActivos = [
    ...(desde >= 0 || hasta >= 0 ? [{ clave: "periodo", texto: rangoTexto, quitar: () => cambiar({ desde: undefined, hasta: undefined }) }] : []),
    ...borrador.sedes.map((s) => ({ clave: `s-${s}`, texto: titular(s), quitar: () => alternarSede(s) })),
    ...borrador.asesores.map((a) => ({ clave: `a-${a}`, texto: nombreAsesor(a), quitar: () => alternarAsesor(a) })),
  ];

  // Al sumar un chip, la franja se desplaza hasta él para que se vea lo recién elegido.
  const totalChips = chipsActivos.length;
  const previos = useRef(totalChips);
  useEffect(() => {
    if (totalChips > previos.current) {
      franja.current?.scrollTo({ left: franja.current.scrollWidth, behavior: "smooth" });
    }
    previos.current = totalChips;
  }, [totalChips]);

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

        {/* Altura fija siempre: el primer chip no empuja el contenido. */}
        <div className="flex h-12 shrink-0 items-center border-b border-linea">
          {chipsActivos.length ? (
            <ul ref={franja} aria-label="Filtros elegidos" className="franja min-w-0 flex-1 items-center gap-1.5 px-4">
              {chipsActivos.map((c) => (
                <li key={c.clave} className="shrink-0">
                  <button
                    type="button"
                    onClick={c.quitar}
                    aria-label={`Quitar ${c.texto}`}
                    className="inline-flex h-8 max-w-[12rem] items-center gap-1 rounded-full bg-brand/10 pr-2 pl-3 text-xs font-medium whitespace-nowrap text-brand transition-transform active:scale-95"
                  >
                    <span className="truncate">{c.texto}</span>
                    <X aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 text-xs text-tinta-3">Sin filtros: se muestra todo.</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <section aria-labelledby="f-periodo" className="px-4 pt-5 pb-6">
            <div className="flex items-baseline justify-between gap-2">
              <h3 id="f-periodo" className="text-sm font-semibold">
                Periodo
              </h3>
              <p className="text-xs text-tinta-3" aria-live="polite">
                {rangoTexto}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-6 gap-1.5">
              {PERIODOS.map((p, i) => {
                const extremo = i === desde || i === hasta;
                const dentro = desde >= 0 && hasta >= 0 && i > desde && i < hasta;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => tocarMes(i)}
                    aria-pressed={extremo || dentro}
                    aria-label={`${mesCorto(p)} ${p.slice(0, 4)}`}
                    className={`h-12 rounded-xl text-sm font-medium capitalize transition-[transform,background-color] active:scale-95 ${
                      extremo
                        ? "bg-brand text-background"
                        : dentro
                          ? "bg-brand/15 text-brand"
                          : "bg-superficie ring-1 ring-linea"
                    }`}
                  >
                    {mesCorto(p)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-tinta-3">Toca el mes de inicio y luego el de fin.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {atajos.map((a) => {
                const activo = borrador.desde === a.desde && borrador.hasta === a.hasta;
                return (
                  <button
                    key={a.texto}
                    type="button"
                    onClick={() => cambiar({ desde: a.desde, hasta: a.hasta })}
                    aria-pressed={activo}
                    className={`h-9 rounded-full px-3.5 text-xs font-medium transition-transform active:scale-95 ${
                      activo ? "bg-foreground text-background" : "bg-superficie ring-1 ring-linea"
                    }`}
                  >
                    {a.texto}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="f-sede" className="border-t border-linea px-4 pt-5 pb-6">
            <div className="flex items-baseline justify-between gap-2">
              <h3 id="f-sede" className="text-sm font-semibold">
                Sede
              </h3>
              <p className="text-xs text-tinta-3">{borrador.sedes.length ? `${borrador.sedes.length} elegidas` : "Todas"}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {opcionesSede.length === 0 &&
                Array.from({ length: 7 }, (_, i) => <span key={i} className="esqueleto h-11 w-24 rounded-full" />)}
              {opcionesSede.map((s) => {
                const activa = borrador.sedes.includes(s.valor);
                return (
                  <button
                    key={s.valor}
                    type="button"
                    onClick={() => alternarSede(s.valor)}
                    aria-pressed={activa}
                    className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-[transform,background-color] active:scale-95 ${
                      activa ? "bg-brand text-background" : "bg-superficie ring-1 ring-linea"
                    }`}
                  >
                    {activa && <Check aria-hidden="true" className="h-4 w-4" />}
                    {titular(s.texto)}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="f-asesor" className="border-t border-linea px-4 pt-5 pb-6">
            <div className="flex items-baseline justify-between gap-2">
              <h3 id="f-asesor" className="text-sm font-semibold">
                Asesor
              </h3>
              <p className="text-xs text-tinta-3">
                {borrador.asesores.length ? `${borrador.asesores.length} elegidos` : borrador.sedes.length ? "De las sedes elegidas" : "Todos"}
              </p>
            </div>
            <div className="relative mt-3">
              <label htmlFor="buscar-asesor-movil" className="sr-only">
                Buscar asesor
              </label>
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-tinta-3" />
              <input
                id="buscar-asesor-movil"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar asesor"
                className="h-11 w-full rounded-full bg-superficie pr-4 pl-11 text-base ring-1 ring-linea outline-none placeholder:text-tinta-3 focus:ring-2 focus:ring-brand"
              />
            </div>
            <ul className="mt-2 divide-y divide-linea">
              {asesoresVisibles.map((a) => {
                const activo = borrador.asesores.includes(a.valor);
                return (
                  <li key={a.valor}>
                    <button
                      type="button"
                      onClick={() => alternarAsesor(a.valor)}
                      aria-pressed={activo}
                      className="flex min-h-12 w-full items-center gap-3 py-2 text-left active:bg-brand/5"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors ${
                          activo ? "bg-brand text-background" : "ring-1 ring-tinta-3/50"
                        }`}
                      >
                        {activo && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.texto}</span>
                        <span className="block text-xs text-tinta-3">{titular(a.detalle ?? "")}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {opcionesAsesor.length > 0 && asesoresVisibles.length === 0 && (
                <li className="py-4 text-center text-sm text-tinta-3">Ningún asesor coincide con “{busqueda}”.</li>
              )}
            </ul>
          </section>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-linea bg-plano px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setBorrador(filtrosVacios)}
            disabled={!cantidad}
            className="h-12 flex-1 rounded-full text-sm font-medium ring-1 ring-linea transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={aplicar}
            disabled={sinCambios}
            className="h-12 flex-[2] rounded-full bg-brand text-sm font-semibold text-background transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {sinCambios ? "Sin cambios" : cantidad ? `Aplicar ${cantidad} ${cantidad === 1 ? "filtro" : "filtros"}` : "Aplicar sin filtros"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
