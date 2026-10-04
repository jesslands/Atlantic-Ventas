"use client";

import { useRouter } from "next/navigation";
import { entero, mesCorto, mesLargo, money, moneyCompacto, variacion } from "../../lib/analytics";
import {
  useApi,
  filtrosAQuery,
  type ClienteListado,
  type FilaSede,
  type Kpis,
  type PuntoTendencia,
} from "../../lib/apiClient";
import { useFiltros } from "../../lib/filtros";
import DataTable, { type Columna } from "./DataTable";
import Section from "../Section";
import { COLOR, ColumnasMes, GraficoTendencia, Leyenda, LineaMes, ListaBarras } from "./charts";
import { Delta, EstadoCarga, Indicadores, Kpi, Tarjeta } from "./ui";

const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

const columnasClientes: Columna<ClienteListado>[] = [
  {
    clave: "nombre",
    titulo: "Cliente",
    valor: (f) => f.nombre,
    secundario: (f) => `${f.tipo} · ${f.sede.charAt(0)}${f.sede.slice(1).toLowerCase()}`,
    render: (f) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{f.nombre}</p>
        <p className="truncate text-xs text-tinta-3">
          {f.tipo} · {f.sede}
        </p>
      </div>
    ),
  },
  { clave: "ventas", titulo: "Ventas", valor: (f) => f.ventas, numerica: true, formato: "entero" },
  {
    clave: "ticketMedio",
    titulo: "Ticket medio",
    valor: (f) => (f.ventas ? f.neto / f.ventas : 0),
    numerica: true,
  },
  { clave: "neto", titulo: "Neto", valor: (f) => f.neto, numerica: true, barra: true },
];

const DESCRIPCION =
  "Ventas del primer semestre de 2026 frente al mes anterior, con proyección lineal a diciembre.";

export default function Resumen() {
  const router = useRouter();
  const [filtros, setFiltros] = useFiltros();
  const query = filtrosAQuery(filtros);

  const kpis = useApi<{ kpis: Kpis }>(`/api/kpis${query}`, { conservar: true });
  const tendencia = useApi<{ serie: PuntoTendencia[] }>(`/api/ventas/tendencia${query}`, { conservar: true });
  const sedes = useApi<{ sedes: FilaSede[] }>(`/api/ventas/sedes${query}`, { conservar: true });
  const topClientes = useApi<{ clientes: ClienteListado[] }>(
    `/api/clientes${filtrosAQuery(filtros, { orden: "neto", dir: "desc", porPagina: 40 })}`,
    { conservar: true },
  );

  const cargando = kpis.cargando || tendencia.cargando || sedes.cargando || topClientes.cargando;
  const error = kpis.error ?? tendencia.error ?? sedes.error ?? topClientes.error;

  if (error || !kpis.datos || !tendencia.datos || !sedes.datos || !topClientes.datos) {
    return (
      <Section title="Resumen" description={DESCRIPCION}>
        <EstadoCarga error={error} />
      </Section>
    );
  }

  const k = kpis.datos.kpis;
  const serie = tendencia.datos.serie;
  const reales = serie.filter((p) => p.real !== null);
  const actual = reales.at(-1);
  const anterior = reales.at(-2);
  const delta = (valor: (p: PuntoTendencia) => number | null) =>
    actual && anterior ? variacion(valor(actual) ?? 0, valor(anterior) ?? 0) : null;
  const porMes = (valor: (p: PuntoTendencia) => number | null) =>
    reales.map((p) => ({ periodo: p.periodo, valor: valor(p) ?? 0 }));

  const cierre = serie.at(-1);
  const deltaNeto = k.variacion_vs_mes_anterior?.pct ?? delta((p) => p.real);
  const comparacion =
    actual && anterior ? `${mesCorto(actual.periodo)} vs. ${mesCorto(anterior.periodo)}` : "vs. mes anterior";

  return (
    <Section title="Resumen" description={DESCRIPCION}>
      <div className={cargando ? "refrescando" : undefined} aria-busy={cargando}>
        <Indicadores nota={`Variación ${comparacion}`}>
          <Kpi titulo="Ticket mediano" valor={money(actual?.ticketMediano ?? 0)} delta={delta((p) => p.ticketMediano)} />
          <Kpi titulo="Ventas" valor={entero(k.transacciones)} delta={delta((p) => p.ventas)} />
          <Kpi titulo="Clientes activos" valor={entero(k.clientes_activos)} delta={delta((p) => p.clientes)} />
          <Kpi
            titulo="Notas crédito"
            valor={moneyCompacto(Math.abs(k.monto_notas))}
            detalle={`${entero(k.notas_credito)} notas`}
            delta={delta((p) => (p.montoNotas === null ? null : Math.abs(p.montoNotas)))}
            maloSiSube
          />
        </Indicadores>

        <div className="mt-3">
          <Tarjeta>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <h2 className="text-sm text-tinta-3">Venta neta</h2>
                <p className="mt-1 text-[2.1rem] leading-none font-semibold tracking-[-0.03em] sm:text-5xl">
                  {moneyCompacto(k.venta_neta)}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-tinta-3">
                  {deltaNeto !== null && <Delta valor={deltaNeto} />}
                  {comparacion}
                  {cierre?.proyeccion != null && cierre.real === null && (
                    <span>
                      · proyección {mesLargo(cierre.periodo)}{" "}
                      <span className="font-semibold text-foreground">{moneyCompacto(cierre.proyeccion)}</span>
                    </span>
                  )}
                </p>
              </div>
              <Leyenda
                items={[
                  { texto: "Neto real", color: COLOR.dato },
                  { texto: "Proyección", color: COLOR.dato, tipo: "punteada" },
                ]}
              />
            </div>
            <GraficoTendencia datos={serie} />
          </Tarjeta>

        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Tarjeta
            className="lg:col-span-7"
            titulo="Venta por sede"
            subtitulo="Neto y participación del periodo. Toca una sede para filtrar todo el tablero."
          >
            <ListaBarras
              items={sedes.datos.sedes.map((s) => ({
                clave: s.sede,
                etiqueta: s.sede.charAt(0) + s.sede.slice(1).toLowerCase(),
                detalle: `${entero(s.clientes)} clientes · ${entero(s.ventas)} ventas`,
                valor: s.neto,
                texto: moneyCompacto(s.neto),
                extra: `${nf1.format(s.participacion)} %`,
              }))}
              alSeleccionar={(sede) => setFiltros({ sedes: [String(sede)] })}
            />
          </Tarjeta>

          <Tarjeta
            className="lg:col-span-5"
            titulo="Notas crédito por mes"
            subtitulo="Monto devuelto, en valor absoluto."
          >
            <ColumnasMes
              datos={porMes((p) => (p.montoNotas === null ? null : Math.abs(p.montoNotas)))}
              nombre="Notas crédito"
              color={COLOR.acento}
              alto="h-48 sm:h-56 lg:h-80"
            />
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-linea pt-4">
              {[
                ["Devoluciones", `${nf1.format(k.pct_devoluciones)} %`, "del neto"],
                ["Filas en cero", entero(k.ceros), "ajustes sin monto"],
                ["Atípicos", entero(k.atipicos), "ventas > $1 M"],
              ].map(([titulo, valor, detalle]) => (
                <div key={titulo} className="min-w-0">
                  <dt className="truncate text-xs text-tinta-3">{titulo}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tracking-tight">{valor}</dd>
                  <dd className="truncate text-[0.7rem] text-tinta-3">{detalle}</dd>
                </div>
              ))}
            </dl>
          </Tarjeta>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Tarjeta titulo="Clientes activos por mes" subtitulo="Clientes con al menos una compra.">
            <LineaMes datos={porMes((p) => p.clientes)} nombre="Clientes" formato={entero} />
          </Tarjeta>
          <Tarjeta titulo="Ticket mediano por mes" subtitulo="Mediana del valor por venta.">
            <LineaMes datos={porMes((p) => p.ticketMediano)} nombre="Ticket mediano" formato={money} />
          </Tarjeta>
        </div>

        <Tarjeta className="mt-3" titulo="Clientes con mayor neto" subtitulo="Los 40 primeros del periodo filtrado. Toca uno para ver su historial.">
          <DataTable
            etiqueta="Clientes con mayor neto"
            columnas={columnasClientes}
            filas={topClientes.datos.clientes}
            claveFila={(f) => f.cod_cliente}
            ordenInicial={{ columna: "neto", direccion: "desc" }}
            alSeleccionar={(f) => router.push(`/clientes/${f.cod_cliente}`)}
          />
        </Tarjeta>
      </div>
    </Section>
  );
}
