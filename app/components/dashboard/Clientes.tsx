"use client";

import { ArrowLeft, Search } from "lucide-react";
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
  type FilaCliente,
  analizar,
  detalleCliente,
  entero,
  money,
  moneyCompacto,
} from "../../lib/analytics";
import { datosDemo } from "../../lib/mockSales";
import { useFiltros } from "../../lib/filtros";
import DataTable, { type Columna } from "./DataTable";
import Section from "../Section";
import { Kpi, Tarjeta } from "./ui";

const BRAND = "#57522c";

const columnas: Columna<FilaCliente>[] = [
  {
    clave: "nombre",
    titulo: "Cliente",
    valor: (f) => f.nombre,
    render: (f) => (
      <div>
        <p className="font-medium">{f.nombre}</p>
        <p className="text-xs text-foreground/50">
          {f.codigo} · {f.tipo}
        </p>
      </div>
    ),
  },
  { clave: "sede", titulo: "Sede", valor: (f) => f.sede },
  { clave: "ventas", titulo: "Ventas", valor: (f) => f.ventas, numerica: true },
  {
    clave: "ticketMedio",
    titulo: "Ticket medio",
    valor: (f) => f.ticketMedio,
    numerica: true,
  },
  {
    clave: "montoNotas",
    titulo: "Nota crédito",
    valor: (f) => f.montoNotas,
    numerica: true,
  },
  { clave: "neto", titulo: "Neto", valor: (f) => f.neto, numerica: true },
  {
    clave: "ultimaCompra",
    titulo: "Última compra",
    valor: (f) => f.ultimaCompra,
  },
];

export default function Clientes() {
  const datos = useMemo(() => datosDemo(), []);
  const [filtros] = useFiltros();
  const [busqueda, setBusqueda] = useState("");
  const [codigo, setCodigo] = useState<number | null>(null);

  const clientes = useMemo(
    () => analizar(datos, filtros).clientes,
    [datos, filtros],
  );

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.tipo, c.sede, c.asesor, String(c.codigo)].some((campo) =>
        campo.toLowerCase().includes(termino),
      ),
    );
  }, [clientes, busqueda]);

  const ficha = useMemo(
    () => (codigo ? detalleCliente(datos, filtros, codigo) : null),
    [datos, filtros, codigo],
  );

  if (ficha && codigo) {
    const cliente = datos.clientes.find((c) => c.codigo === codigo)!;
    return (
      <Section
        title={cliente.nombre}
        description={`${cliente.tipo} · ${cliente.sede} · asesor ${cliente.asesor}. Historial de compras con los filtros generales activos.`}
      >
        <button
          type="button"
          onClick={() => setCodigo(null)}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-foreground/5 px-4 text-sm font-medium transition-colors hover:bg-foreground/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al listado
        </button>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            titulo="Neto"
            valor={moneyCompacto(ficha.neto)}
            delta={null}
            detalle="en el periodo"
            serie={ficha.periodos.map((p) => p.neto)}
          />
          <Kpi
            titulo="Ventas"
            valor={entero(ficha.ventas)}
            delta={null}
            detalle="en el periodo"
            serie={ficha.periodos.map((p) => p.ventas)}
          />
          <Kpi
            titulo="Ticket mediano"
            valor={moneyCompacto(ficha.ticketMediano)}
            delta={null}
            detalle="por venta"
            serie={ficha.periodos.map((p) => p.neto)}
          />
          <Kpi
            titulo="Nota crédito"
            valor={moneyCompacto(Math.abs(ficha.montoNotas))}
            delta={null}
            detalle={`${entero(ficha.notas)} notas`}
            serie={ficha.periodos.map((p) => p.notas)}
            maloSiSube
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Tarjeta
            titulo="Historial mensual"
            subtitulo="Neto por mes (millones)."
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ficha.periodos.map((p) => ({
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

          <Tarjeta
            titulo="Materiales más comprados"
            subtitulo={
              ficha.primeraCompra
                ? `Primera compra ${ficha.primeraCompra} · última ${ficha.ultimaCompra}`
                : "Sin compras en el periodo"
            }
          >
            <ul className="space-y-2 text-sm">
              {ficha.materiales.map((m) => (
                <li key={`${m.nombre}-${m.ventas}`} className="flex items-baseline justify-between gap-4">
                  <span className="truncate">{m.nombre}</span>
                  <span className="shrink-0 tabular-nums text-foreground/70">
                    {money(m.neto)} · {entero(m.ventas)} ventas
                  </span>
                </li>
              ))}
              {!ficha.materiales.length && (
                <li className="text-foreground/60">Sin datos para este periodo.</li>
              )}
            </ul>
          </Tarjeta>
        </div>

        <Tarjeta className="mt-4" titulo="Detalle por mes">
          <DataTable
            etiqueta={`Historial de compras de ${cliente.nombre}`}
            columnas={[
              { clave: "periodo", titulo: "Periodo", valor: (f) => f.periodo },
              { clave: "ventas", titulo: "Ventas", valor: (f) => f.ventas, numerica: true },
              { clave: "neto", titulo: "Neto", valor: (f) => f.neto, numerica: true },
              { clave: "notas", titulo: "Notas crédito", valor: (f) => f.notas, numerica: true },
            ]}
            filas={ficha.periodos}
            claveFila={(f) => f.periodo}
            ordenInicial={{ columna: "periodo", direccion: "asc" }}
            porPagina={12}
          />
        </Tarjeta>
      </Section>
    );
  }

  return (
    <Section
      title="Clientes"
      description="Busca, ordena y abre la ficha de cualquier cliente para revisar su historial de compras."
    >
      <div className="mt-8 space-y-4">
        <div className="relative max-w-md">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-foreground/40"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar cliente"
            placeholder="Buscar por nombre, tipo, sede o código"
            className="h-11 w-full rounded-full border border-foreground/15 bg-white/60 pr-4 pl-11 text-sm"
          />
        </div>
      </div>

      <Tarjeta className="mt-6" titulo="Listado de clientes">
        <DataTable
          etiqueta="Listado de clientes"
          columnas={columnas}
          filas={filtrados}
          claveFila={(f) => f.codigo}
          ordenInicial={{ columna: "neto", direccion: "desc" }}
          alSeleccionar={(f) => setCodigo(f.codigo)}
          porPagina={12}
        />
      </Tarjeta>
    </Section>
  );
}
