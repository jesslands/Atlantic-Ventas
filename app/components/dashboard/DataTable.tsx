"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { entero, money } from "../../lib/analytics";

export type Columna<T> = {
  clave: string;
  titulo: string;
  valor: (fila: T) => string | number;
  render?: (fila: T) => ReactNode;
  numerica?: boolean;
};

type Props<T> = {
  etiqueta: string;
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string | number;
  porPagina?: number;
  ordenInicial?: { columna: string; direccion: "asc" | "desc" };
  alSeleccionar?: (fila: T) => void;
  seleccionado?: string | number;
  totalFila?: (columnas: Columna<T>[], filas: T[]) => ReactNode;
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
}: Props<T>) {
  const [orden, setOrden] = useState(ordenInicial);
  const [pagina, setPagina] = useState(0);

  const columnaOrden = columnas.find((c) => c.clave === orden.columna);
  const ordenadas = columnaOrden
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

  const paginas = Math.max(1, Math.ceil(ordenadas.length / porPagina));
  const actual = Math.min(pagina, paginas - 1);
  const visibles = ordenadas.slice(actual * porPagina, (actual + 1) * porPagina);

  const ordenarPor = (clave: string) =>
    setOrden((prev) =>
      prev.columna === clave
        ? { columna: clave, direccion: prev.direccion === "asc" ? "desc" : "asc" }
        : { columna: clave, direccion: "desc" },
    );

  return (
    <div>
      <div className="-mx-5 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <caption className="sr-only">{etiqueta}</caption>
          <thead>
            <tr className="border-b border-foreground/15">
              {columnas.map((columna) => {
                const activa = orden.columna === columna.clave;
                return (
                  <th
                    key={columna.clave}
                    scope="col"
                    aria-sort={
                      activa
                        ? orden.direccion === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={`px-3 py-2 font-montserrat text-xs font-bold tracking-wide uppercase ${
                      columna.numerica ? "text-right" : "text-left"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => ordenarPor(columna.clave)}
                      className={`inline-flex items-center gap-1 py-1 hover:text-[#57522c] ${
                        columna.numerica ? "flex-row-reverse" : ""
                      }`}
                    >
                      {columna.titulo}
                      <span aria-hidden="true" className="text-[0.6rem]">
                        {activa ? (orden.direccion === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((fila) => {
              const clave = claveFila(fila);
              const seleccionable = Boolean(alSeleccionar);
              return (
                <tr
                  key={clave}
                  onClick={seleccionable ? () => alSeleccionar?.(fila) : undefined}
                  className={`border-b border-foreground/5 ${
                    seleccionado === clave
                      ? "bg-[#c28e4b]/10"
                      : seleccionable
                        ? "cursor-pointer hover:bg-foreground/5"
                        : ""
                  }`}
                >
                  {columnas.map((columna) => (
                    <td
                      key={columna.clave}
                      className={`px-3 py-2.5 align-middle ${
                        columna.numerica ? "text-right tabular-nums" : "text-left"
                      }`}
                    >
                      {columna.render
                        ? columna.render(fila)
                        : columna.numerica && typeof columna.valor(fila) === "number"
                          ? money(columna.valor(fila) as number)
                          : columna.valor(fila)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!visibles.length && (
              <tr>
                <td
                  colSpan={columnas.length}
                  className="px-3 py-8 text-center text-foreground/60"
                >
                  Sin resultados para los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 text-sm text-foreground/60">
        <p>
          {entero(ordenadas.length)} registros · página {actual + 1} de {paginas}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={actual === 0}
            onClick={() => setPagina(actual - 1)}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-foreground/10 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Página siguiente"
            disabled={actual >= paginas - 1}
            onClick={() => setPagina(actual + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-foreground/10 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
