"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { entero, money } from "../../lib/analytics";

export type Columna<T> = {
  clave: string;
  titulo: string;
  valor: (fila: T) => string | number;
  render?: (fila: T) => ReactNode;
  numerica?: boolean;
  /** Formato del valor numérico por defecto (sin `render` propio): "dinero"
   * antepone "$" y redondea (para montos); "entero" es un conteo plano
   * (ventas, clientes, notas). Default "dinero" para no romper las columnas
   * de montos existentes. */
  formato?: "dinero" | "entero";
  /** Dibuja una barra fina bajo el valor, proporcional al máximo de la página. */
  barra?: boolean;
  /** Columnas que el servidor no sabe ordenar: no se ofrecen como orden. */
  sinOrden?: boolean;
  /** Texto plano a mostrar en la tarjeta móvil cuando `render` usa marcado propio. */
  texto?: (fila: T) => string;
  /** Línea secundaria bajo el nombre en la tarjeta móvil (solo columna principal). */
  secundario?: (fila: T) => string;
  /** Mostrar esta columna en la línea de datos de la tarjeta móvil (máx. 2). */
  enMovil?: boolean;
};

type Orden = { columna: string; direccion: "asc" | "desc" };

type Props<T> = {
  etiqueta: string;
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string | number;
  porPagina?: number;
  ordenInicial?: Orden;
  alSeleccionar?: (fila: T) => void;
  seleccionado?: string | number;
  /**
   * Modo servidor: cuando se pasan estos tres, `filas` ya llega ordenada y
   * paginada desde la API (una sola página), así que la tabla no vuelve a
   * ordenar ni a recortar nada; solo pinta y delega los clics hacia afuera.
   * Sin ellos, la tabla ordena y pagina en el cliente como siempre.
   */
  ordenControlado?: Orden;
  onOrdenar?: (columna: string) => void;
  paginaControlada?: number;
  onPaginaCambiar?: (pagina: number) => void;
  totalRegistros?: number;
  cargando?: boolean;
};

export default function DataTable<T>({
  etiqueta,
  columnas,
  filas,
  claveFila,
  porPagina = 10,
  ordenInicial = { columna: "", direccion: "desc" },
  alSeleccionar,
  seleccionado,
  ordenControlado,
  onOrdenar,
  paginaControlada,
  onPaginaCambiar,
  totalRegistros,
  cargando = false,
}: Props<T>) {
  const servidor = Boolean(ordenControlado && onOrdenar);
  const [ordenInterno, setOrdenInterno] = useState(ordenInicial);
  const [paginaInterna, setPaginaInterna] = useState(0);

  const orden = ordenControlado ?? ordenInterno;
  const pagina = paginaControlada ?? paginaInterna;

  const columnaOrden = columnas.find((c) => c.clave === orden.columna);
  const ordenadas =
    !servidor && columnaOrden
      ? [...filas].sort((a, b) => {
          const va = columnaOrden.valor(a);
          const vb = columnaOrden.valor(b);
          const comparacion =
            typeof va === "number" && typeof vb === "number"
              ? va - vb
              : String(va).localeCompare(String(vb));
          return orden.direccion === "asc" ? comparacion : -comparacion;
        })
      : filas;

  const total = totalRegistros ?? ordenadas.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const actual = Math.min(pagina, paginas - 1);
  const visibles = servidor ? ordenadas : ordenadas.slice(actual * porPagina, (actual + 1) * porPagina);

  const maximos = new Map(
    columnas
      .filter((c) => c.barra)
      .map((c) => [c.clave, Math.max(...visibles.map((f) => Math.abs(Number(c.valor(f)) || 0)), 1)]),
  );

  const ordenarPor = (clave: string) => {
    if (onOrdenar) return onOrdenar(clave);
    setOrdenInterno((prev) =>
      prev.columna === clave
        ? { columna: clave, direccion: prev.direccion === "asc" ? "desc" : "asc" }
        : { columna: clave, direccion: "desc" },
    );
  };

  const irAPagina = (siguiente: number) => (onPaginaCambiar ? onPaginaCambiar(siguiente) : setPaginaInterna(siguiente));

  const celda = (columna: Columna<T>, fila: T) => {
    if (columna.render) return columna.render(fila);
    const valor = columna.valor(fila);
    if (!columna.numerica || typeof valor !== "number") return valor;
    const texto = columna.formato === "entero" ? entero(valor) : money(valor);
    if (!columna.barra) return texto;
    const ancho = (Math.abs(valor) / (maximos.get(columna.clave) ?? 1)) * 100;
    return (
      <span className="inline-flex w-full flex-col items-end gap-1">
        {texto}
        <span className="flex h-1 w-24 justify-end">
          <span className="barra barra-izq block h-full rounded-full bg-dato/70" style={{ width: `${ancho}%` }} />
        </span>
      </span>
    );
  };

  const [principal, ...resto] = columnas;
  const destacada = [...columnas].reverse().find((c) => c.barra) ?? resto.at(-1);
  const secundarias = resto.filter((c) => c !== destacada);
  const enMovil = (secundarias.some((c) => c.enMovil) ? secundarias.filter((c) => c.enMovil) : secundarias).slice(0, 2);

  // Texto plano (sin barras ni marcado de bloque) para el interior de los botones móviles.
  const textoPlano = (columna: Columna<T>, fila: T) => {
    if (columna.texto) return columna.texto(fila);
    const valor = columna.valor(fila);
    if (!columna.numerica || typeof valor !== "number") return String(valor);
    return columna.formato === "entero" ? entero(valor) : money(valor);
  };
  const ordenables = columnas.filter((c) => !c.sinOrden);

  const vacio = !cargando && !visibles.length;

  return (
    <div className={cargando && visibles.length ? "refrescando" : undefined} aria-busy={cargando}>
      {/* Móvil: tarjetas apiladas con el dato principal arriba a la derecha. */}
      <div className="md:hidden">
        <div className="mb-3 flex items-center gap-2">
          <label className="sr-only" htmlFor={`orden-${etiqueta}`}>
            Ordenar por
          </label>
          <select
            id={`orden-${etiqueta}`}
            value={orden.columna}
            onChange={(e) => ordenarPor(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-full border border-linea bg-plano px-4 text-sm"
          >
            {!orden.columna && <option value="">Ordenar por…</option>}
            {ordenables.map((c) => (
              <option key={c.clave} value={c.clave}>
                Ordenar por {c.titulo.toLowerCase()}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => orden.columna && ordenarPor(orden.columna)}
            disabled={!orden.columna}
            aria-label={orden.direccion === "asc" ? "Orden ascendente; cambiar a descendente" : "Orden descendente; cambiar a ascendente"}
            className="presionable flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-linea bg-plano disabled:opacity-40"
          >
            {orden.direccion === "asc" ? (
              <ArrowUpNarrowWide aria-hidden="true" className="h-4 w-4" />
            ) : (
              <ArrowDownWideNarrow aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>

        <ul aria-label={etiqueta} className="space-y-2">
          {cargando &&
            !visibles.length &&
            Array.from({ length: 4 }, (_, i) => (
              <li key={i}>
                <div className="esqueleto h-[4.25rem] rounded-xl" />
              </li>
            ))}
          {visibles.map((fila) => {
            const clave = claveFila(fila);
            const sub = principal.secundario?.(fila);
            const cuerpo = (
              <>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{textoPlano(principal, fila)}</span>
                    {sub && <span className="block truncate text-xs text-tinta-3">{sub}</span>}
                  </span>
                  {destacada && (
                    <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                      <span className="sr-only">, {destacada.titulo}: </span>
                      {celda(destacada, fila)}
                    </span>
                  )}
                </span>
                {enMovil.length > 0 && (
                  <span className="mt-1.5 flex items-center gap-x-4 text-xs">
                    {enMovil.map((c) => (
                      <span key={c.clave} className="min-w-0 truncate">
                        <span className="sr-only">, </span>
                        <span className="text-tinta-3">{c.titulo} </span>
                        <span className="tabular-nums">{textoPlano(c, fila)}</span>
                      </span>
                    ))}
                    {alSeleccionar && <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-tinta-3" />}
                  </span>
                )}
              </>
            );
            const tarjeta = "block w-full rounded-xl bg-plano/70 px-3.5 py-3 text-left";
            return (
              <li key={clave}>
                {alSeleccionar ? (
                  <button
                    type="button"
                    onClick={() => alSeleccionar(fila)}
                    className={`presionable ${tarjeta} ${seleccionado === clave ? "bg-acento/15" : "active:bg-dato/10"}`}
                  >
                    {cuerpo}
                  </button>
                ) : (
                  <div className={tarjeta}>{cuerpo}</div>
                )}
              </li>
            );
          })}
          {vacio && <li className="py-8 text-center text-sm text-tinta-3">Sin resultados con los filtros actuales. Prueba ampliando el periodo o quitando filtros.</li>}
        </ul>
      </div>

      {/* Escritorio: tabla. */}
      <div className="-mx-6 hidden overflow-x-auto px-6 md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{etiqueta}</caption>
          <thead>
            <tr className="border-b border-linea">
              {columnas.map((columna) => {
                const activa = orden.columna === columna.clave;
                return (
                  <th
                    key={columna.clave}
                    scope="col"
                    aria-sort={activa ? (orden.direccion === "asc" ? "ascending" : "descending") : "none"}
                    className={`px-3 py-2 text-xs font-medium whitespace-nowrap text-tinta-3 ${
                      columna.numerica ? "text-right" : "text-left"
                    }`}
                  >
                    {columna.sinOrden ? (
                      columna.titulo
                    ) : (
                      <button
                        type="button"
                        onClick={() => ordenarPor(columna.clave)}
                        className={`inline-flex items-center gap-1 rounded py-1 transition-colors hover:text-foreground ${
                          activa ? "text-foreground" : ""
                        } ${columna.numerica ? "flex-row-reverse" : ""}`}
                      >
                        {columna.titulo}
                        <span aria-hidden="true" className={`text-[0.6rem] ${activa ? "" : "opacity-40"}`}>
                          {activa ? (orden.direccion === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    )}
                  </th>
                );
              })}
              {alSeleccionar && <th aria-hidden="true" className="w-6" />}
            </tr>
          </thead>
          <tbody>
            {cargando &&
              !visibles.length &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={columnas.length + (alSeleccionar ? 1 : 0)} className="px-3 py-2">
                    <div className="esqueleto h-8 rounded-lg" />
                  </td>
                </tr>
              ))}
            {visibles.map((fila) => {
              const clave = claveFila(fila);
              const seleccionable = Boolean(alSeleccionar);
              return (
                <tr
                  key={clave}
                  onClick={seleccionable ? () => alSeleccionar?.(fila) : undefined}
                  onKeyDown={
                    seleccionable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            alSeleccionar?.(fila);
                          }
                        }
                      : undefined
                  }
                  tabIndex={seleccionable ? 0 : undefined}
                  className={`group border-b border-linea/70 transition-colors last:border-0 ${
                    seleccionado === clave
                      ? "bg-acento/10"
                      : seleccionable
                        ? "cursor-pointer hover:bg-dato/[0.05]"
                        : ""
                  }`}
                >
                  {columnas.map((columna) => (
                    <td
                      key={columna.clave}
                      className={`px-3 py-3 align-middle ${columna.numerica ? "text-right tabular-nums" : "text-left"}`}
                    >
                      {celda(columna, fila)}
                    </td>
                  ))}
                  {seleccionable && (
                    <td className="pr-2 text-tinta-3">
                      <ChevronRight aria-hidden="true" className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                    </td>
                  )}
                </tr>
              );
            })}
            {vacio && (
              <tr>
                <td colSpan={columnas.length} className="px-3 py-10 text-center text-tinta-3">
                  Sin resultados con los filtros actuales. Prueba ampliando el periodo o quitando filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!vacio && (
        <div className="mt-4 flex min-h-11 items-center justify-between gap-4 text-sm text-tinta-3">
          <p className="tabular-nums">
            {entero(total)} registros{paginas > 1 && ` · página ${actual + 1} de ${entero(paginas)}`}
          </p>
          {paginas > 1 && <div className="flex gap-1">
            <button
              type="button"
              aria-label="Página anterior"
              disabled={actual === 0}
              onClick={() => irAPagina(actual - 1)}
              className="presionable flex h-11 w-11 items-center justify-center rounded-full hover:bg-dato/10 disabled:opacity-30"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Página siguiente"
              disabled={actual >= paginas - 1}
              onClick={() => irAPagina(actual + 1)}
              className="presionable flex h-11 w-11 items-center justify-center rounded-full hover:bg-dato/10 disabled:opacity-30"
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>}
        </div>
      )}
    </div>
  );
}
