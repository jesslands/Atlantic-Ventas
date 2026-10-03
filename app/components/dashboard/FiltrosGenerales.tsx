"use client";

import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { PERIODOS, datosDemo } from "../../lib/mockSales";
import { activos, useFiltros } from "../../lib/filtros";
import MultiSelect, { type Opcion } from "./MultiSelect";
import { usePopover } from "./usePopover";

const resumen = (texto: string, cantidad: number) =>
  cantidad === 1 ? texto : `${cantidad} ${texto}`;

export default function FiltrosGenerales({
  oscuro = false,
  compacto = false,
}: {
  oscuro?: boolean;
  compacto?: boolean;
}) {
  const [datos] = useState(datosDemo);
  const [filtros, setFiltros, limpiar] = useFiltros();
  const [abierto, setAbierto] = useState(false);
  const contenedor = usePopover<HTMLDivElement>(abierto, setAbierto);
  const cantidad = activos(filtros);
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

  const opcionesPeriodo: Opcion[] = PERIODOS.map((p) => ({ valor: p, texto: p }));
  const opcionesMaterial: Opcion[] = datos.materiales.map((m) => ({
    valor: String(m.codigo),
    texto: m.nombre,
    detalle: m.categoria,
  }));
  const opcionesSede: Opcion[] = datos.sedes.map((s) => ({
    valor: s.sede,
    texto: s.sede,
    detalle: s.asesor,
  }));

  return (
    <div className={`relative w-full ${compacto ? "flex items-center" : ""}`} ref={contenedor}>
      <div className={`flex items-center gap-2 ${compacto
              ? "flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "flex-wrap"}`}>
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
            className={`${icono} transition-transform duration-200 ${
              abierto ? "rotate-180" : ""
            }`}
          />
        </button>

        {cantidad > 0 && (
          <ul aria-label="Filtros activos" className="flex flex-wrap items-center gap-2">
            {filtros.periodos.length > 0 && (
              <li>
                <Badge alto={altoChip} tono={chip} onClick={() => setFiltros({ periodos: [] })}>
                  {filtros.periodos.length === 1
                    ? filtros.periodos[0]
                    : resumen("periodos", filtros.periodos.length)}
                </Badge>
              </li>
            )}
            {filtros.materiales.length > 0 && (
              <li>
                <Badge alto={altoChip} tono={chip} onClick={() => setFiltros({ materiales: [] })}>
                  {filtros.materiales.length === 1
                    ? (opcionesMaterial.find(
                        (o) => o.valor === String(filtros.materiales[0]),
                      )?.texto ?? "1 material")
                    : resumen("materiales", filtros.materiales.length)}
                </Badge>
              </li>
            )}
            {filtros.sedes.length > 0 && (
              <li>
                <Badge alto={altoChip} tono={chip} onClick={() => setFiltros({ sedes: [] })}>
                  {filtros.sedes.length === 1
                    ? filtros.sedes[0]
                    : resumen("sedes", filtros.sedes.length)}
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

      {abierto && (
        <div
          role="dialog"
          aria-label="Filtros generales"
          className="absolute top-full right-0 left-0 z-50 mt-2 rounded-2xl border border-foreground/10 bg-background p-5 shadow-[0_10px_30px_rgba(0,0,0,0.15)] sm:right-auto sm:left-0 sm:w-[26rem]"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-montserrat text-sm font-bold tracking-wide uppercase">
                Filtros generales
              </h2>
              <p className="mt-1 text-xs text-foreground/60">
                Se aplican en Resumen, Asesores y Clientes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar filtros"
              className="-mt-1 -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-foreground/60">Periodo</p>
              <MultiSelect
                etiqueta="Periodo"
                placeholder="Todos los periodos"
                opciones={opcionesPeriodo}
                valor={filtros.periodos}
                onChange={(periodos) => setFiltros({ periodos })}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-foreground/60">Material</p>
              <MultiSelect
                etiqueta="Material"
                placeholder="Todos los materiales"
                opciones={opcionesMaterial}
                valor={filtros.materiales.map(String)}
                onChange={(materiales) =>
                  setFiltros({ materiales: materiales.map(Number) })
                }
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-foreground/60">Sede</p>
              <MultiSelect
                etiqueta="Sede"
                placeholder="Todas las sedes"
                opciones={opcionesSede}
                valor={filtros.sedes}
                onChange={(sedes) => setFiltros({ sedes })}
              />
            </div>
          </div>

        </div>
      )}
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
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full font-medium transition-colors ${alto} ${tono}`}
    >
      {children}
      <X aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}
