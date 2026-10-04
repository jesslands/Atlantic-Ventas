"use client";

import type { ReactNode } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { mesCorto, mesLargo, moneyCompacto, pctSigno } from "../../lib/analytics";

/**
 * Valores espejo de los tokens de globals.css (Recharts pinta SVG con props,
 * no con clases). Paleta validada con la skill dataviz contra --superficie.
 */
export const COLOR = {
  dato: "#66701f",
  acento: "#b8862b",
  negativo: "#9c4a6e",
  rejilla: "#ece2d1",
  tinta: "#1f1f1f",
  tinta3: "#6b6557",
  superficie: "#fffbf5",
};

/** Recharts parte los ticks en los espacios: "$4,5 mil M" quedaba en dos líneas. */
const sinCorte = (texto: string) => texto.replace(/ /g, "\u00a0");

const ANIMACION = { animationDuration: 500, animationEasing: "ease-out" as const };

const ejeX = {
  tickLine: false,
  axisLine: { stroke: "#d9ccb6" },
  tick: { fontSize: 11, fill: COLOR.tinta3 },
  tickMargin: 8,
};

const ejeY = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: COLOR.tinta3 },
  width: 76,
};

type FilaTooltip = { name?: string; value?: number | string | null; color?: string; dataKey?: unknown };

/** Tooltip común: el valor manda (fuerte), la serie acompaña con una línea de color. */
function TooltipGrafico({
  active,
  payload,
  label,
  formato = moneyCompacto,
}: {
  active?: boolean;
  payload?: FilaTooltip[];
  label?: string | number;
  formato?: (n: number) => string;
}) {
  const filas = (payload ?? []).filter((f) => f.value !== null && f.value !== undefined);
  if (!active || !filas.length) return null;
  return (
    <div className="rounded-xl bg-[#1f1f1f] px-3 py-2 text-xs text-[#f3e5d3] shadow-[0_8px_24px_-8px_rgba(31,31,31,0.45)]">
      <p className="mb-1 text-[#f3e5d3]/70">{mesLargo(String(label))}</p>
      {filas.map((f) => (
        <p key={String(f.dataKey)} className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: f.color }} />
          <span className="font-semibold">{formato(Number(f.value))}</span>
          <span className="text-[#f3e5d3]/70">{f.name}</span>
        </p>
      ))}
    </div>
  );
}

/** Clave de leyenda: línea para series de línea, cuadro para barras/áreas. */
export function Leyenda({ items }: { items: { texto: string; color: string; tipo?: "linea" | "punteada" | "barra" }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tinta-2">
      {items.map((i) => (
        <li key={i.texto} className="flex items-center gap-1.5">
          {i.tipo === "barra" ? (
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          ) : (
            <span
              aria-hidden="true"
              className="w-4 border-t-2"
              style={{ borderColor: i.color, borderStyle: i.tipo === "punteada" ? "dashed" : "solid" }}
            />
          )}
          {i.texto}
        </li>
      ))}
    </ul>
  );
}

/** Neto real (área) + proyección a diciembre (línea punteada de la misma serie). */
export function GraficoTendencia({
  datos,
}: {
  datos: { periodo: string; real: number | null; proyeccion: number | null }[];
}) {
  return (
    <div className="h-56 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="relleno-real" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR.dato} stopOpacity={0.16} />
              <stop offset="100%" stopColor={COLOR.dato} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={COLOR.rejilla} />
          <XAxis dataKey="periodo" tickFormatter={mesCorto} interval="preserveStartEnd" {...ejeX} />
          <YAxis tickFormatter={(v) => sinCorte(moneyCompacto(Number(v)))} {...ejeY} />
          <Tooltip
            cursor={{ stroke: COLOR.tinta3, strokeWidth: 1 }}
            content={<TooltipGrafico />}
          />
          <Area
            type="monotone"
            dataKey="real"
            name="Neto real"
            stroke={COLOR.dato}
            strokeWidth={2}
            fill="url(#relleno-real)"
            dot={false}
            activeDot={{ r: 5, stroke: COLOR.superficie, strokeWidth: 2 }}
            connectNulls={false}
            {...ANIMACION}
          />
          <Line
            type="monotone"
            dataKey="proyeccion"
            name="Proyección"
            stroke={COLOR.dato}
            strokeWidth={2}
            strokeDasharray="5 5"
            strokeOpacity={0.7}
            dot={false}
            activeDot={{ r: 5, stroke: COLOR.superficie, strokeWidth: 2 }}
            connectNulls={false}
            {...ANIMACION}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Columnas por mes para una sola serie. */
export function ColumnasMes({
  datos,
  nombre,
  color = COLOR.dato,
  formato = moneyCompacto,
  alto = "h-48 sm:h-56",
}: {
  datos: { periodo: string; valor: number }[];
  nombre: string;
  color?: string;
  formato?: (n: number) => string;
  alto?: string;
}) {
  return (
    <div className={`${alto} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={COLOR.rejilla} />
          <XAxis dataKey="periodo" tickFormatter={mesCorto} {...ejeX} />
          <YAxis tickFormatter={(v) => sinCorte(formato(Number(v)))} {...ejeY} />
          <Tooltip cursor={{ fill: "rgba(102,112,31,0.07)" }} content={<TooltipGrafico formato={formato} />} />
          <Bar dataKey="valor" name={nombre} fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} {...ANIMACION} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Línea pequeña para small multiples (una métrica por gráfico, un solo eje). */
export function LineaMes({
  datos,
  nombre,
  formato,
}: {
  datos: { periodo: string; valor: number }[];
  nombre: string;
  formato: (n: number) => string;
}) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={COLOR.rejilla} />
          <XAxis dataKey="periodo" tickFormatter={mesCorto} {...ejeX} />
          <YAxis tickFormatter={(v) => sinCorte(formato(Number(v)))} domain={["auto", "auto"]} {...ejeY} width={52} />
          <Tooltip cursor={{ stroke: COLOR.tinta3, strokeWidth: 1 }} content={<TooltipGrafico formato={formato} />} />
          <Line
            type="monotone"
            dataKey="valor"
            name={nombre}
            stroke={COLOR.dato}
            strokeWidth={2}
            dot={{ r: 4, fill: COLOR.dato, stroke: COLOR.superficie, strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: COLOR.superficie, strokeWidth: 2 }}
            {...ANIMACION}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export type ItemBarra = {
  clave: string | number;
  etiqueta: string;
  detalle?: string;
  valor: number;
  texto: string;
  /** Texto secundario a la derecha del valor (p. ej. participación). */
  extra?: ReactNode;
};

/**
 * Barras horizontales en HTML: la etiqueta va encima de la barra, así los
 * nombres largos (clientes, materiales) nunca se cortan en móvil. Cada barra
 * lleva su valor rotulado, así que no depende de un tooltip.
 */
export function ListaBarras({
  items,
  alSeleccionar,
  color = COLOR.dato,
}: {
  items: ItemBarra[];
  alSeleccionar?: (clave: ItemBarra["clave"]) => void;
  color?: string;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.valor)), 1);
  return (
    <ol className="space-y-3">
      {items.map((i) => {
        const contenido = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{i.etiqueta}</span>
                {i.detalle && <span className="block truncate text-xs text-tinta-3">{i.detalle}</span>}
              </span>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                {i.texto}
                {i.extra && <span className="ml-2 text-xs font-normal text-tinta-3">{i.extra}</span>}
              </span>
            </span>
            <span className="mt-1.5 block h-2 w-full">
              <span
                className="barra block h-full rounded-r-[4px] rounded-l-[2px]"
                style={{ width: `${Math.max((Math.abs(i.valor) / max) * 100, 0.5)}%`, background: color }}
              />
            </span>
          </>
        );
        return (
          <li key={i.clave}>
            {alSeleccionar ? (
              <button
                type="button"
                onClick={() => alSeleccionar(i.clave)}
                className="presionable -mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-left hover:bg-dato/[0.06]"
              >
                {contenido}
              </button>
            ) : (
              <div className="py-0.5">{contenido}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Barras divergentes desde cero: a la derecha crecimiento (oliva), a la
 * izquierda caída (ciruela). La dirección y el signo del rótulo repiten la
 * polaridad, así que el color nunca la carga solo.
 */
export function ListaDivergente({
  items,
  alSeleccionar,
}: {
  items: { clave: string; etiqueta: string; detalle?: string; valor: number }[];
  alSeleccionar?: (clave: string) => void;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.valor)), 1);
  return (
    <ol className="space-y-1">
      {items.map((i) => {
        const ancho = `${(Math.abs(i.valor) / max) * 100}%`;
        const positivo = i.valor >= 0;
        const fila = (
          <span className="grid grid-cols-[minmax(0,7.5rem)_1fr_3.75rem] items-center gap-3 sm:grid-cols-[minmax(0,10rem)_1fr_4rem]">
            <span className="min-w-0">
              <span className="block truncate text-sm">{i.etiqueta}</span>
              {i.detalle && <span className="block truncate text-[0.7rem] text-tinta-3">{i.detalle}</span>}
            </span>
            <span className="grid h-3 grid-cols-2">
              <span className="flex justify-end border-r border-[#d9ccb6]">
                {!positivo && (
                  <span className="barra barra-izq block h-full rounded-l-[4px]" style={{ width: ancho, background: COLOR.negativo }} />
                )}
              </span>
              <span className="flex">
                {positivo && (
                  <span className="barra block h-full rounded-r-[4px]" style={{ width: ancho, background: COLOR.dato }} />
                )}
              </span>
            </span>
            <span className={`text-right text-sm font-semibold tabular-nums ${positivo ? "text-dato" : "text-negativo"}`}>
              {pctSigno(i.valor)}
            </span>
          </span>
        );
        return (
          <li key={i.clave}>
            {alSeleccionar ? (
              <button
                type="button"
                onClick={() => alSeleccionar(i.clave)}
                className="presionable -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1.5 text-left hover:bg-dato/[0.06]"
              >
                {fila}
              </button>
            ) : (
              <div className="py-1">{fila}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
