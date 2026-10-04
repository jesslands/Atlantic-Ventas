"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { entero, mesLargo, money, moneyCompacto } from "../../lib/analytics";
import type { FichaVentas } from "../../lib/apiClient";
import DataTable from "./DataTable";
import { ColumnasMes, ListaBarras } from "./charts";
import { Indicadores, Kpi, Tarjeta, Volver } from "./ui";

export const titular = (texto: string) => texto.charAt(0) + texto.slice(1).toLowerCase();

/** "Volver" a la vista anterior; con un enlace directo, a `respaldo`. */
export function BotonVolver({ respaldo }: { respaldo: string }) {
  const router = useRouter();
  return (
    <Volver onClick={() => (window.history.length > 1 ? router.back() : router.push(respaldo))}>
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only">Volver</span>
    </Volver>
  );
}

/** Total vendido por año + compras, clientes, ticket y notas. */
export function IndicadoresVentas({ f }: { f: FichaVentas }) {
  const primero = f.periodos[0]?.periodo;
  const ultimo = f.periodos.at(-1)?.periodo;
  return (
    <Indicadores nota={primero && ultimo ? `Ventas de ${mesLargo(primero)} a ${mesLargo(ultimo)}` : "Sin ventas en el periodo filtrado"}>
      {f.anios.map((a) => (
        <Kpi key={a.anio} titulo={`Vendido en ${a.anio}`} valor={moneyCompacto(a.neto)} />
      ))}
      <Kpi titulo="Compras" valor={entero(f.ventas)} />
      <Kpi titulo="Clientes" valor={entero(f.clientes)} />
      <Kpi titulo="Ticket medio" valor={money(f.ticket_medio)} />
      {f.notas > 0 && (
        <Kpi titulo="Notas crédito" valor={moneyCompacto(Math.abs(f.monto_notas))} detalle={`${entero(f.notas)} notas`} />
      )}
    </Indicadores>
  );
}

/** Neto mes a mes: columnas + tabla con compras y clientes de cada mes. */
export function MesAMes({ f, nombre }: { f: FichaVentas; nombre: string }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
      <Tarjeta className="lg:col-span-7" titulo="Neto mes a mes" subtitulo={`Ventas de ${nombre} por mes.`}>
        <ColumnasMes datos={f.periodos.map((p) => ({ periodo: p.periodo, valor: p.neto }))} nombre="Neto" alto="h-56 sm:h-64" />
      </Tarjeta>
      <Tarjeta className="lg:col-span-5" titulo="Detalle por mes">
        <DataTable
          etiqueta={`Ventas mensuales de ${nombre}`}
          columnas={[
            {
              clave: "periodo",
              titulo: "Mes",
              valor: (p) => p.periodo,
              texto: (p) => mesLargo(p.periodo),
              render: (p) => <span className="font-medium whitespace-nowrap">{mesLargo(p.periodo)}</span>,
            },
            { clave: "ventas", titulo: "Compras", valor: (p) => p.ventas, numerica: true, formato: "entero" },
            { clave: "clientes", titulo: "Clientes", valor: (p) => p.clientes, numerica: true, formato: "entero" },
            { clave: "neto", titulo: "Neto", valor: (p) => p.neto, numerica: true, barra: true },
          ]}
          filas={f.periodos}
          claveFila={(p) => p.periodo}
          ordenInicial={{ columna: "periodo", direccion: "desc" }}
          porPagina={12}
        />
      </Tarjeta>
    </div>
  );
}

/** Los 10 clientes que más compran; cada uno abre su ficha. */
export function TopClientes({ f, className = "" }: { f: FichaVentas; className?: string }) {
  const router = useRouter();
  return (
    <Tarjeta className={className} titulo="Clientes que más compran" subtitulo="Los 10 primeros por neto. Toca uno para ver su ficha.">
      {f.top_clientes.length ? (
        <ListaBarras
          items={f.top_clientes.map((c) => ({
            clave: c.codigo,
            etiqueta: c.nombre,
            detalle: `${c.tipo} · ${titular(c.sede)}`,
            valor: c.neto,
            texto: moneyCompacto(c.neto),
            extra: `${entero(c.ventas)} c.`,
          }))}
          alSeleccionar={(codigo) => router.push(`/clientes/${codigo}`)}
        />
      ) : (
        <p className="py-6 text-center text-sm text-tinta-3">Sin compras en el periodo filtrado.</p>
      )}
    </Tarjeta>
  );
}
