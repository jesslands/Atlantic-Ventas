"use client";

import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type FilaAsesor,
  type FilaCliente,
  analizar,
  detalleAsesor,
  entero,
  moneyCompacto,
  variacion,
} from "../../lib/analytics";
import { datosDemo } from "../../lib/mockSales";
import { useFiltros } from "../../lib/filtros";
import DataTable, { type Columna } from "./DataTable";
import Section from "../Section";
import { Kpi, Tarjeta } from "./ui";

const BRAND = "#57522c";

const columnasCliente: Columna<FilaCliente>[] = [
  { clave: "nombre", titulo: "Cliente", valor: (f) => f.nombre },
  { clave: "ventas", titulo: "Ventas", valor: (f) => f.ventas, numerica: true },
  {
    clave: "ticketMedio",
    titulo: "Ticket medio",
    valor: (f) => f.ticketMedio,
    numerica: true,
  },
  { clave: "neto", titulo: "Neto", valor: (f) => f.neto, numerica: true },
];

export default function Asesores() {
  const datos = useMemo(() => datosDemo(), []);
  const [filtros] = useFiltros();
  const [asesor, setAsesor] = useState<string | null>(null);

  const detalle = useMemo(
    () => (asesor ? detalleAsesor(datos, filtros, asesor) : null),
    [datos, filtros, asesor],
  );

  const ranking: FilaAsesor[] = useMemo(
    () => analizar(datos, filtros).asesores,
    [datos, filtros],
  );

  if (detalle && asesor) {
    const historial = detalle.periodos;
    const actual = historial[historial.length - 1];
    const anterior = historial[historial.length - 2];
    const delta = actual && anterior ? variacion(actual.neto, anterior.neto) : null;
    const neto = historial.reduce((acc, p) => acc + p.neto, 0);
    const ventas = historial.reduce((acc, p) => acc + p.ventas, 0);
    const ficha = datos.sedes.find((s) => s.asesor === asesor);

    return (
      <Section
        title={ficha?.nombre ?? asesor}
        description={`${ficha?.sede ?? ""} · evolución mensual y principales clientes con los filtros generales activos.`}
      >
        <button
          type="button"
          onClick={() => setAsesor(null)}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-foreground/5 px-4 text-sm font-medium transition-colors hover:bg-foreground/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al ranking
        </button>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            titulo="Neto"
            valor={moneyCompacto(neto)}
            delta={delta}
            detalle="vs. mes anterior"
            serie={historial.map((p) => p.neto)}
          />
          <Kpi
            titulo="Ventas"
            valor={entero(ventas)}
            delta={null}
            detalle="en el periodo"
            serie={historial.map((p) => p.ventas)}
          />
          <Kpi
            titulo="Clientes"
            valor={entero(detalle.totalClientes)}
            delta={null}
            detalle="con compra"
            serie={historial.map((p) => p.ventas)}
          />
          <Kpi
            titulo="Ticket medio"
            valor={moneyCompacto(neto / Math.max(1, ventas))}
            delta={null}
            detalle="en el periodo"
            serie={historial.map((p) => p.neto)}
          />
        </div>

        <Tarjeta
          className="mt-6"
          titulo="Evolución mensual"
          subtitulo="Neto por mes (millones)."
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={historial.map((p) => ({
                  periodo: p.periodo.replace("2026-", ""),
                  neto: Math.round(p.neto / 1e6),
                }))}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f14" />
                <XAxis dataKey="periodo" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={56}
                  tickFormatter={(v) => `$${Number(v)}M`}
                />
                <Tooltip formatter={(valor) => `$${Number(valor)}M`} />
                <Bar dataKey="neto" name="Neto" fill={BRAND} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>

        <Tarjeta className="mt-4" titulo="Principales clientes">
          <DataTable
            etiqueta={`Principales clientes de ${ficha?.nombre ?? asesor}`}
            columnas={columnasCliente}
            filas={detalle.clientes}
            claveFila={(f) => f.codigo}
            ordenInicial={{ columna: "neto", direccion: "desc" }}
          />
        </Tarjeta>
      </Section>
    );
  }

  return (
    <Section
      title="Asesores"
      description="Ranking por sede. Selecciona un asesor para ver su evolución mensual y sus principales clientes."
    >
      <Tarjeta
        className="mt-6"
        titulo="Ranking de asesores"
        subtitulo="Neto con los filtros generales activos. Haz clic en una fila para abrir el detalle."
      >
        <DataTable
          etiqueta="Ranking de asesores"
          columnas={columnasAsesor}
          filas={ranking}
          claveFila={(f) => f.codigo}
          ordenInicial={{ columna: "neto", direccion: "desc" }}
          alSeleccionar={(f) => setAsesor(f.codigo)}
        />
      </Tarjeta>
    </Section>
  );
}

const columnasAsesor: Columna<FilaAsesor>[] = [
  { clave: "nombre", titulo: "Asesor", valor: (f) => f.nombre },
  { clave: "sede", titulo: "Sede", valor: (f) => f.sede },
  { clave: "ventas", titulo: "Ventas", valor: (f) => f.ventas, numerica: true },
  { clave: "clientes", titulo: "Clientes", valor: (f) => f.clientes, numerica: true },
  {
    clave: "ticketMedio",
    titulo: "Ticket medio",
    valor: (f) => f.ticketMedio,
    numerica: true,
  },
  { clave: "neto", titulo: "Neto", valor: (f) => f.neto, numerica: true },
];
