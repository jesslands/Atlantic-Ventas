"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { entero, mesCorto, money, moneyCompacto, variacion } from "../../lib/analytics";
import { useApi, filtrosAQuery, type FichaAsesor, type FilaAsesor } from "../../lib/apiClient";
import { useFiltros } from "../../lib/filtros";
import DataTable, { type Columna } from "./DataTable";
import Section from "../Section";
import { ColumnasMes, ListaBarras, ListaDivergente } from "./charts";
import { EstadoCarga, Indicadores, Kpi, Tarjeta, Volver } from "./ui";

const TOP = 10;

const titular = (texto: string) => texto.charAt(0) + texto.slice(1).toLowerCase();

const columnasAsesor: Columna<FilaAsesor>[] = [
  {
    clave: "nombre",
    titulo: "Asesor",
    valor: (f) => f.nombre,
    secundario: (f) => titular(f.sede),
    render: (f) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{f.nombre}</p>
        <p className="truncate text-xs text-tinta-3">{titular(f.sede)}</p>
      </div>
    ),
  },
  { clave: "ventas", titulo: "Ventas", valor: (f) => f.ventas, numerica: true, formato: "entero" },
  { clave: "clientes", titulo: "Clientes", valor: (f) => f.clientes, numerica: true, formato: "entero" },
  { clave: "ticketMedio", titulo: "Ticket medio", valor: (f) => f.ticketMedio, numerica: true },
  { clave: "neto", titulo: "Neto", valor: (f) => f.neto, numerica: true, barra: true },
];

const columnasCliente: Columna<FichaAsesor["clientes"][number]>[] = [
  { clave: "nombre", titulo: "Cliente", valor: (f) => f.nombre, render: (f) => <p className="truncate font-medium">{f.nombre}</p> },
  { clave: "ventas", titulo: "Ventas", valor: (f) => f.ventas, numerica: true, formato: "entero" },
  {
    clave: "ticketMedio",
    titulo: "Ticket medio",
    valor: (f) => (f.ventas ? f.neto / f.ventas : 0),
    numerica: true,
  },
  { clave: "neto", titulo: "Neto", valor: (f) => f.neto, numerica: true, barra: true },
];

export default function Asesores() {
  const router = useRouter();
  const [filtros] = useFiltros();
  const [codigo, setCodigo] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  const ranking = useApi<{ ranking: FilaAsesor[] }>(
    `/api/asesores/ranking${filtrosAQuery(filtros, { limite: 100 })}`,
    { conservar: true },
  );
  const ficha = useApi<FichaAsesor>(codigo ? `/api/asesores/${codigo}${filtrosAQuery(filtros)}` : null);

  const abrir = (c: string) => {
    setCodigo(c);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (codigo) {
    const volver = (
      <Volver onClick={() => setCodigo(null)}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Volver al ranking
      </Volver>
    );

    if (ficha.cargando || ficha.error || !ficha.datos) {
      return (
        <Section title="Asesor" description="Evolución mensual y principales clientes con los filtros generales activos.">
          <div className="mt-6">{volver}</div>
          <EstadoCarga error={ficha.error} />
        </Section>
      );
    }

    const f = ficha.datos;
    const historial = f.periodos;
    const actual = historial.at(-1);
    const anterior = historial.at(-2);
    const delta = actual && anterior ? variacion(actual.neto, anterior.neto) : null;
    const comparacion =
      actual && anterior ? `${mesCorto(actual.periodo)} vs. ${mesCorto(anterior.periodo)}` : "en el periodo";

    return (
      <Section
        title={f.asesor.nombre}
        description={`Sede ${titular(f.asesor.sede)}. Evolución mensual y principales clientes con los filtros generales activos.`}
      >
        <div className="mt-6">{volver}</div>

        <Indicadores nota={delta !== null ? `Variación ${comparacion}` : undefined}>
          <Kpi titulo="Neto" valor={moneyCompacto(f.neto)} delta={delta} />
          <Kpi titulo="Ventas" valor={entero(f.ventas)} />
          <Kpi titulo="Clientes (mejor mes)" valor={entero(Math.max(...historial.map((p) => p.clientes), 0))} />
          <Kpi titulo="Ticket medio" valor={money(f.ticket_medio)} />
          <Kpi titulo="Notas crédito" valor={entero(f.notas)} detalle={moneyCompacto(Math.abs(f.monto_notas))} />
        </Indicadores>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Tarjeta className="lg:col-span-7" titulo="Neto por mes">
            <ColumnasMes datos={historial.map((p) => ({ periodo: p.periodo, valor: p.neto }))} nombre="Neto" alto="h-56 sm:h-64" />
          </Tarjeta>
          <Tarjeta className="lg:col-span-5" titulo="Clientes con mayor neto" subtitulo="Los 8 primeros del asesor.">
            <ListaBarras
              items={[...f.clientes]
                .sort((a, b) => b.neto - a.neto)
                .slice(0, 8)
                .map((c) => ({
                  clave: c.codigo,
                  etiqueta: c.nombre,
                  valor: c.neto,
                  texto: moneyCompacto(c.neto),
                  extra: `${entero(c.ventas)} v.`,
                }))}
              alSeleccionar={(c) => router.push(`/clientes/${c}`)}
            />
          </Tarjeta>
        </div>

        <Tarjeta className="mt-3" titulo="Todos sus clientes">
          <DataTable
            etiqueta={`Clientes de ${f.asesor.nombre}`}
            columnas={columnasCliente}
            filas={f.clientes}
            claveFila={(c) => c.codigo}
            ordenInicial={{ columna: "neto", direccion: "desc" }}
            alSeleccionar={(c) => router.push(`/clientes/${c.codigo}`)}
          />
        </Tarjeta>
      </Section>
    );
  }

  const descripcion = "Ranking de asesores por neto. Toca un asesor para ver su evolución mensual y sus clientes.";

  if (ranking.error || !ranking.datos) {
    return (
      <Section title="Asesores" description={descripcion}>
        <EstadoCarga error={ranking.error} />
      </Section>
    );
  }

  const filas = ranking.datos.ranking;
  const porNeto = [...filas].sort((a, b) => b.neto - a.neto);
  const visibles = verTodos ? porNeto : porNeto.slice(0, TOP);
  const porVariacion = [...filas].sort((a, b) => b.variacionPct - a.variacionPct);

  return (
    <Section title="Asesores" description={descripcion}>
      <div className={ranking.cargando ? "refrescando" : undefined} aria-busy={ranking.cargando}>
        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Tarjeta
            className="lg:col-span-7"
            titulo="Neto por asesor"
            subtitulo={`${entero(filas.length)} asesores con ventas en el periodo.`}
          >
            <ListaBarras
              items={visibles.map((a) => ({
                clave: a.codigo,
                etiqueta: a.nombre,
                detalle: `${titular(a.sede)} · ${entero(a.clientes)} clientes`,
                valor: a.neto,
                texto: moneyCompacto(a.neto),
              }))}
              alSeleccionar={(c) => abrir(String(c))}
            />
            {porNeto.length > TOP && (
              <button
                type="button"
                onClick={() => setVerTodos((v) => !v)}
                className="presionable mt-4 h-11 w-full rounded-full border border-linea text-sm font-medium hover:bg-dato/[0.06]"
              >
                {verTodos ? `Ver solo los ${TOP} primeros` : `Ver los ${entero(porNeto.length)} asesores`}
              </button>
            )}
          </Tarjeta>

          <Tarjeta
            className="lg:col-span-5"
            titulo="Variación del último mes"
            subtitulo="Neto del último mes del periodo contra el mes anterior."
          >
            <ListaDivergente
              items={porVariacion.map((a) => ({
                clave: a.codigo,
                etiqueta: a.nombre.replace(/^Asesor\s+/i, ""),
                valor: a.variacionPct,
              }))}
              alSeleccionar={abrir}
            />
          </Tarjeta>
        </div>

        <Tarjeta className="mt-3" titulo="Detalle del ranking">
          <DataTable
            etiqueta="Ranking de asesores"
            columnas={columnasAsesor}
            filas={filas}
            claveFila={(f) => f.codigo}
            ordenInicial={{ columna: "neto", direccion: "desc" }}
            alSeleccionar={(f) => abrir(f.codigo)}
            porPagina={25}
          />
        </Tarjeta>
      </div>
    </Section>
  );
}
