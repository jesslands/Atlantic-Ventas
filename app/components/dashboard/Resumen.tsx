"use client";

import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  entero,
  analizar,
  money,
  moneyCompacto,
  proyectar,
  variacion,
} from "../../lib/analytics";
import { datosDemo } from "../../lib/mockSales";
import { useFiltros } from "../../lib/filtros";
import DataTable, { type Columna } from "./DataTable";
import Section from "../Section";
import { Kpi, Tarjeta } from "./ui";

const BRAND = "#57522c";
const GOLD = "#c28e4b";

export default function Resumen() {
  const datos = useMemo(() => datosDemo(), []);
  const [filtros] = useFiltros();

  const analisis = useMemo(() => analizar(datos, filtros), [datos, filtros]);

  const { periodos: filas, notasSinRespaldo } = analisis;
  const actual = filas[filas.length - 1];
  const anterior = filas[filas.length - 2];
  const delta = (valor: (f: (typeof filas)[number]) => number) =>
    actual && anterior ? variacion(valor(actual), valor(anterior)) : 0;
  const serie = (valor: (f: (typeof filas)[number]) => number) =>
    filas.map(valor);

  const tendencia = useMemo(
    () =>
      proyectar(filas).map((p) => ({
        periodo: p.periodo.replace("2026-", ""),
        real: p.real === null ? null : Math.round(p.real / 1e6),
        proyeccion:
          p.proyeccion === null ? null : Math.round(p.proyeccion / 1e6),
        notas: Math.round(
          (filas.find((f) => f.periodo === p.periodo)?.montoNotas ?? 0) / 1e6,
        ),
      })),
    [filas],
  );

  const columnasClientes: Columna<(typeof analisis.clientes)[number]>[] = [
    { clave: "nombre", titulo: "Cliente", valor: (f) => f.nombre },
    { clave: "tipo", titulo: "Tipo", valor: (f) => f.tipo },
    { clave: "ventas", titulo: "Ventas", valor: (f) => f.ventas, numerica: true },
    {
      clave: "ticketMedio",
      titulo: "Ticket medio",
      valor: (f) => f.ticketMedio,
      numerica: true,
    },
    { clave: "neto", titulo: "Neto", valor: (f) => f.neto, numerica: true },
  ];

  return (
    <Section
      title="Resumen"
      description="Comportamiento de las ventas del primer semestre de 2026 con comparación contra el mes anterior y proyección a diciembre."
    >
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          titulo="Neto total"
          valor={moneyCompacto(analisis.neto)}
          delta={delta((f) => f.neto)}
          detalle="vs. mes anterior"
          serie={serie((f) => f.neto)}
        />
        <Kpi
          titulo="Ticket mediano"
          valor={moneyCompacto(analisis.ticketMediano)}
          delta={delta((f) => f.ticketMediano)}
          detalle="vs. mes anterior"
          serie={serie((f) => f.ticketMediano)}
        />
        <Kpi
          titulo="Ventas"
          valor={entero(analisis.ventas)}
          delta={delta((f) => f.ventas)}
          detalle="vs. mes anterior"
          serie={serie((f) => f.ventas)}
        />
        <Kpi
          titulo="Clientes activos"
          valor={entero(analisis.totalClientes)}
          delta={delta((f) => f.clientes)}
          detalle="vs. mes anterior"
          serie={serie((f) => f.clientes)}
        />
        <Kpi
          titulo="Nota crédito"
          valor={moneyCompacto(Math.abs(analisis.montoNotas))}
          delta={delta((f) => f.montoNotas)}
          detalle={`${entero(analisis.notas)} notas`}
          serie={serie((f) => f.montoNotas)}
          maloSiSube
        />
      </div>

      <Tarjeta
        className="mt-6"
        titulo="Tendencia mensual y proyección a diciembre"
        subtitulo="Barras: notas crédito (millones). Líneas: neto real y proyección por regresión lineal sobre los meses filtrados."
      >
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={tendencia}
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
              <Tooltip
                formatter={(valor, nombre) =>
                  nombre === "notas"
                    ? moneyCompacto(Number(valor) * 1e6)
                    : `$${Number(valor)}M`
                }
                labelFormatter={(p) => `2026-${p}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="notas" name="Nota crédito" fill={GOLD} radius={[4, 4, 0, 0]} />
              <Area
                type="monotone"
                dataKey="real"
                name="Neto real"
                stroke={BRAND}
                strokeWidth={2.5}
                fill={BRAND}
                fillOpacity={0.12}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="proyeccion"
                name="Proyección"
                stroke={BRAND}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 3 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Tarjeta>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Tarjeta
          titulo="Venta por sede"
          subtitulo="Neto del periodo filtrado, de mayor a menor."
        >
          <div className="h-[22rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={analisis.sedes.map((s) => ({
                  ...s,
                  neto: Math.round(s.neto / 1e6),
                }))}
                layout="vertical"
                margin={{ top: 8, right: 24, bottom: 0, left: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f14" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(v) => `$${Number(v)}M`}
                />
                <YAxis
                  type="category"
                  dataKey="sede"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={110}
                />
                <Tooltip formatter={(valor) => `$${Number(valor)}M`} />
                <Bar dataKey="neto" name="Neto" fill={BRAND} radius={[0, 4, 4, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>

        <Tarjeta
          titulo="Señales de calidad"
          subtitulo="Vista rápida de los hallazgos del análisis de datos."
        >
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {[
              ["Filas en cero", entero(analisis.ceros), "Ajustes sin monto"],
              ["Atípicos > $1M", entero(analisis.atipicos), "Cola larga"],
              ["Notas crédito", entero(analisis.notas), moneyCompacto(analisis.montoNotas)],
              [
                "Notas sin respaldo",
                entero(notasSinRespaldo.length),
                "Sin compra en el periodo",
              ],
            ].map(([titulo, valor, detalle]) => (
              <div key={titulo} className="rounded-xl bg-foreground/5 p-4">
                <dt className="text-xs text-foreground/60">{titulo}</dt>
                <dd className="font-montserrat mt-1 text-lg font-bold">{valor}</dd>
                <dd className="text-xs text-foreground/50">{detalle}</dd>
              </div>
            ))}
          </dl>

          {notasSinRespaldo.length > 0 && (
            <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
              <p className="font-montserrat font-bold">
                {entero(notasSinRespaldo.length)} notas crédito de clientes que
                solo devuelven
              </p>
              <p className="mt-1 text-foreground/70">
                Mayor: {notasSinRespaldo[0].cliente} ·{" "}
                {money(notasSinRespaldo[0].monto)} ({notasSinRespaldo[0].periodo})
              </p>
            </div>
          )}
        </Tarjeta>
      </div>

      <Tarjeta className="mt-4" titulo="Top clientes por neto">
        <DataTable
          etiqueta="Top clientes por neto"
          columnas={columnasClientes}
          filas={analisis.clientes.slice(0, 40)}
          claveFila={(f) => f.codigo}
          ordenInicial={{ columna: "neto", direccion: "desc" }}
        />
      </Tarjeta>
    </Section>
  );
}
