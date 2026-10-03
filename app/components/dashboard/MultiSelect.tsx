"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { usePopover } from "./usePopover";

export type Opcion = { valor: string; texto: string; detalle?: string };

export default function MultiSelect({
  etiqueta,
  placeholder,
  opciones,
  valor,
  onChange,
}: {
  etiqueta: string;
  placeholder: string;
  opciones: Opcion[];
  valor: string[];
  onChange: (siguiente: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedor = usePopover<HTMLDivElement>(abierto, setAbierto);

  const marcadas = new Set(valor);
  const alternar = (opcion: string) =>
    onChange(
      marcadas.has(opcion)
        ? valor.filter((v) => v !== opcion)
        : [...valor, opcion],
    );

  const visibles = busqueda
    ? opciones.filter((o) =>
        `${o.texto} ${o.detalle ?? ""}`.toLowerCase().includes(busqueda.toLowerCase()),
      )
    : opciones;

  const resumen =
    valor.length === 0
      ? placeholder
      : valor.length === 1
        ? (opciones.find((o) => o.valor === valor[0])?.texto ?? valor[0])
        : `${valor.length} seleccionados`;

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        className="flex h-11 w-full items-center justify-between gap-2 rounded-full border border-foreground/15 bg-white/60 px-4 text-sm"
      >
        <span className={`truncate ${valor.length ? "font-medium" : "text-foreground/60"}`}>
          {resumen}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {valor.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange([]);
                }
              }}
              title="Quitar selección"
              className="flex h-6 w-6 items-center justify-center rounded-full text-foreground/50 hover:bg-foreground/10"
            >
              ×
            </span>
          )}
          <ChevronDown aria-hidden="true" className="h-4 w-4 opacity-60" />
        </span>
      </button>

      {abierto && (
        <div
          role="listbox"
          aria-label={etiqueta}
          aria-multiselectable
          className="absolute top-full right-0 left-0 z-50 mt-1 w-full rounded-2xl sm:right-auto sm:left-0 sm:min-w-64 border border-foreground/10 bg-background p-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
        >
          {opciones.length > 12 && (
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar ${etiqueta.toLowerCase()}`}
              aria-label={`Buscar ${etiqueta.toLowerCase()}`}
              className="mb-2 h-10 w-full rounded-full border border-foreground/15 bg-white/60 px-3 text-sm"
            />
          )}

          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {visibles.map((opcion) => (
              <li key={opcion.valor}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-foreground/5">
                  <input
                    type="checkbox"
                    checked={marcadas.has(opcion.valor)}
                    onChange={() => alternar(opcion.valor)}
                    className="h-4 w-4 accent-[#57522c]"
                  />
                  <span className="flex-1 truncate">
                    {opcion.texto}
                    {opcion.detalle && (
                      <span className="ml-1 text-xs text-foreground/50">
                        {opcion.detalle}
                      </span>
                    )}
                  </span>
                  {marcadas.has(opcion.valor) && (
                    <Check aria-hidden="true" className="h-4 w-4 text-[#57522c]" />
                  )}
                </label>
              </li>
            ))}
            {!visibles.length && (
              <li className="px-2 py-3 text-sm text-foreground/60">
                Sin coincidencias.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
