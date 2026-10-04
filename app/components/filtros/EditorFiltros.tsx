"use client";

import { Check, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mesCorto } from "../../lib/analytics";
import { filtrosVacios, useApi, type FilaAsesor, type FilaSede } from "../../lib/apiClient";
import { activos, PERIODOS, useFiltros, type Filtros } from "../../lib/filtros";

export type Opcion = { valor: string; texto: string; detalle?: string };

const titular = (texto: string) => texto.charAt(0) + texto.slice(1).toLowerCase();

const mismaLista = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const iguales = (a: Filtros, b: Filtros) =>
  a.desde === b.desde && a.hasta === b.hasta && mismaLista(a.sedes, b.sedes) && mismaLista(a.asesores, b.asesores);

/**
 * Catálogos reales: se piden (sin filtros) solo cuando hacen falta;
 * /ventas/sedes y /asesores/ranking devuelven las listas completas de la base.
 */
export function useCatalogos(activo: boolean) {
  const { datos: sedesResp } = useApi<{ sedes: FilaSede[] }>(activo ? "/api/ventas/sedes" : null);
  const { datos: asesoresResp } = useApi<{ ranking: FilaAsesor[] }>(
    activo ? "/api/asesores/ranking?limite=100" : null,
  );
  const opcionesSede: Opcion[] = (sedesResp?.sedes ?? [])
    .map((s) => ({ valor: s.sede, texto: s.sede }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  const opcionesAsesor: Opcion[] = (asesoresResp?.ranking ?? [])
    .map((a) => ({ valor: a.codigo, texto: a.nombre, detalle: a.sede }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  return { opcionesSede, opcionesAsesor };
}

/** "Todo el periodo", "Solo jun 2026" o "mar a may 2026". */
export function textoPeriodo(desde?: string, hasta?: string) {
  const i = desde ? PERIODOS.indexOf(desde) : -1;
  const j = hasta ? PERIODOS.indexOf(hasta) : -1;
  const ultimo = PERIODOS.length - 1;
  if (i < 0 && j < 0) return "Todo el periodo";
  if (i === j) return `Solo ${mesCorto(PERIODOS[i])} ${PERIODOS[i].slice(0, 4)}`;
  return `${mesCorto(PERIODOS[Math.max(i, 0)])} a ${mesCorto(PERIODOS[j < 0 ? ultimo : j])} ${PERIODOS[ultimo].slice(0, 4)}`;
}

/**
 * Editor de filtros compartido por el panel lateral móvil y el popover de
 * escritorio. Trabaja sobre un borrador: el tablero solo se recalcula al tocar
 * "Aplicar"; cerrar sin aplicar descarta los cambios.
 *
 * Ocupa todo el alto de su contenedor (que debe ser `flex flex-col` con alto
 * definido): franja de chips fija arriba, secciones con scroll y acciones abajo.
 */
export default function EditorFiltros({ alCerrar }: { alCerrar: () => void }) {
  const [filtros, setFiltros] = useFiltros();
  const [borrador, setBorrador] = useState<Filtros>(filtros);
  const [busqueda, setBusqueda] = useState("");
  const franja = useRef<HTMLUListElement>(null);
  const { opcionesSede, opcionesAsesor } = useCatalogos(true);

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
  const rangoTexto = textoPeriodo(borrador.desde, borrador.hasta);

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
    ...(desde >= 0 || hasta >= 0
      ? [{ clave: "periodo", texto: rangoTexto, quitar: () => cambiar({ desde: undefined, hasta: undefined }) }]
      : []),
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

  return (
    <>
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
                  className="inline-flex h-8 max-w-[12rem] items-center gap-1 rounded-full bg-brand/10 pr-2 pl-3 text-xs font-medium whitespace-nowrap text-brand transition-[transform,background-color] hover:bg-brand/15 active:scale-95"
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                  className={`h-12 rounded-xl text-sm font-medium capitalize transition-[transform,background-color] active:scale-95 sm:h-11 ${
                    extremo
                      ? "bg-brand text-background"
                      : dentro
                        ? "bg-brand/15 text-brand hover:bg-brand/20"
                        : "bg-superficie ring-1 ring-linea hover:bg-white"
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
                    activo ? "bg-foreground text-background" : "bg-superficie ring-1 ring-linea hover:bg-white"
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
              Array.from({ length: 7 }, (_, i) => <span key={i} className="esqueleto h-11 w-24 rounded-full sm:h-10" />)}
            {opcionesSede.map((s) => {
              const activa = borrador.sedes.includes(s.valor);
              return (
                <button
                  key={s.valor}
                  type="button"
                  onClick={() => alternarSede(s.valor)}
                  aria-pressed={activa}
                  className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-[transform,background-color] active:scale-95 sm:h-10 ${
                    activa ? "bg-brand text-background" : "bg-superficie ring-1 ring-linea hover:bg-white"
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
              {borrador.asesores.length
                ? `${borrador.asesores.length} elegidos`
                : borrador.sedes.length
                  ? "De las sedes elegidas"
                  : "Todos"}
            </p>
          </div>
          <div className="relative mt-3">
            <label htmlFor="buscar-asesor-filtros" className="sr-only">
              Buscar asesor
            </label>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-tinta-3" />
            <input
              id="buscar-asesor-filtros"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar asesor"
              className="h-11 w-full rounded-full bg-superficie pr-4 pl-11 text-base ring-1 ring-linea outline-none placeholder:text-tinta-3 focus:ring-2 focus:ring-brand sm:text-sm"
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
                    className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-brand/5 active:bg-brand/5"
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
          className="h-12 flex-1 rounded-full text-sm font-medium ring-1 ring-linea transition-transform hover:bg-superficie active:scale-[0.98] disabled:opacity-40 sm:h-11"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={aplicar}
          disabled={sinCambios}
          className="h-12 flex-[2] rounded-full bg-brand text-sm font-semibold text-background transition-transform active:scale-[0.98] disabled:opacity-50 sm:h-11"
        >
          {sinCambios
            ? "Sin cambios"
            : cantidad
              ? `Aplicar ${cantidad} ${cantidad === 1 ? "filtro" : "filtros"}`
              : "Aplicar sin filtros"}
        </button>
      </div>
    </>
  );
}
