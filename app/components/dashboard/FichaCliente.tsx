"use client";

import { ArrowLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { entero, mesLargo, money, moneyCompacto } from "../../lib/analytics";
import { useApi, filtrosAQuery, type Compra, type FichaCliente as Ficha } from "../../lib/apiClient";
import { activos, useFiltros } from "../../lib/filtros";
import CompartirCliente from "./CompartirCliente";
import DataTable, { type Columna } from "./DataTable";
import Section from "../Section";
import { COLOR, ColumnasMes, ListaBarras } from "./charts";
import { EstadoCarga, Indicadores, Kpi, Tarjeta, Volver } from "./ui";

const POR_PAGINA = 15;
const titular = (texto: string) => texto.charAt(0) + texto.slice(1).toLowerCase();

const columnasCompras: Columna<Compra>[] = [
  {
    clave: "material",
    titulo: "Material",
    valor: (c) => c.material,
    secundario: (c) => c.categoria ?? "Sin categoría",
    render: (c) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{c.material}</p>
        <p className="truncate text-xs text-tinta-3">
          {c.cod_material} · {c.categoria ?? "Sin categoría"}
        </p>
      </div>
    ),
  },
  {
    clave: "periodo",
    titulo: "Mes",
    valor: (c) => c.periodo,
    texto: (c) => mesLargo(c.periodo),
    enMovil: true,
    render: (c) => <span className="whitespace-nowrap">{mesLargo(c.periodo)}</span>,
  },
  {
    clave: "tipo",
    titulo: "Tipo",
    valor: (c) => (c.nota_credito ? "Nota crédito" : "Compra"),
    sinOrden: true,
    enMovil: true,
    render: (c) =>
      c.nota_credito ? (
        <span className="inline-flex rounded-full bg-negativo/10 px-2 py-0.5 text-xs font-medium text-negativo">
          Nota crédito
        </span>
      ) : (
        <span className="text-tinta-3">Compra</span>
      ),
  },
  { clave: "neto", titulo: "Neto", valor: (c) => c.neto, numerica: true, barra: true },
];

const ORDENES_API = new Set(["periodo", "neto", "material"]);

export default function FichaCliente({ codigo }: { codigo: string }) {
  const router = useRouter();
  const [filtros, , limpiar] = useFiltros();
  const ficha = useApi<Ficha>(`/api/clientes/${codigo}${filtrosAQuery(filtros)}`, { conservar: true });

  const [busquedaInput, setBusquedaInput] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<{ columna: string; direccion: "asc" | "desc" }>({
    columna: "periodo",
    direccion: "desc",
  });
  const [pagina, setPagina] = useState(0);

  // Debounce: no dispara una petición por cada tecla.
  useEffect(() => {
    const id = setTimeout(() => {
      setBusqueda(busquedaInput);
      setPagina(0);
    }, 300);
    return () => clearTimeout(id);
  }, [busquedaInput]);

  const compras = useApi<{ compras: Compra[]; paginacion: { total: number } }>(
    `/api/clientes/${codigo}/compras${filtrosAQuery(filtros, {
      q: busqueda || undefined,
      orden: orden.columna,
      dir: orden.direccion,
      pagina: pagina + 1,
      porPagina: POR_PAGINA,
    })}`,
    { conservar: true },
  );

  const ordenarPor = (clave: string) => {
    if (!ORDENES_API.has(clave)) return;
    setOrden((prev) =>
      prev.columna === clave
        ? { columna: clave, direccion: prev.direccion === "asc" ? "desc" : "asc" }
        : { columna: clave, direccion: clave === "material" ? "asc" : "desc" },
    );
    setPagina(0);
  };

  // Si se llegó desde otra vista, "volver" regresa allí; con un enlace directo, al listado.
  const volver = (
    <Volver onClick={() => (window.history.length > 1 ? router.back() : router.push("/clientes"))}>
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only">Volver</span>
    </Volver>
  );

  // Con un cliente distinto en la ruta los datos conservados serían de otro: solo se
  // aceptan si corresponden a este código.
  const f = ficha.datos?.cliente.codigo === Number(codigo) ? ficha.datos : null;

  if (ficha.error || !f) {
    return (
      <Section title="Cliente" description="Historial de compras con los filtros generales activos.">
        <div className="mt-6">{volver}</div>
        <EstadoCarga error={ficha.error} />
      </Section>
    );
  }

  return (
    <Section
      title={f.cliente.nombre}
      description={`${f.cliente.tipo} en ${titular(f.cliente.sede)}, asesor ${f.cliente.asesor}. Cliente ${f.cliente.codigo}.`}
    >
      <div className="mt-6 flex items-center justify-between gap-2">
        {volver}
        <CompartirCliente ficha={f} />
      </div>

      {f.ventas === 0 && activos(filtros) > 0 && (
        <div role="status" className="mt-4 flex flex-col gap-3 rounded-2xl bg-acento/10 p-4 text-sm sm:flex-row sm:items-center">
          <p className="flex-1">
            Los filtros activos excluyen a este cliente: es de la sede {titular(f.cliente.sede)} y del asesor{" "}
            {f.cliente.asesor}.
          </p>
          <button
            type="button"
            onClick={limpiar}
            className="presionable h-11 shrink-0 rounded-full bg-brand px-4 font-medium text-background"
          >
            Quitar filtros
          </button>
        </div>
      )}

      <div className={ficha.cargando ? "refrescando" : undefined} aria-busy={ficha.cargando}>
        <Indicadores
          nota={
            f.primera_compra
              ? `Compras de ${mesLargo(f.primera_compra)} a ${mesLargo(f.ultima_compra)}`
              : "Sin compras en el periodo filtrado"
          }
        >
          <Kpi titulo="Neto" valor={moneyCompacto(f.neto)} />
          <Kpi titulo="Compras" valor={entero(f.ventas)} />
          <Kpi titulo="Ticket medio" valor={money(f.ticket_medio)} />
          <Kpi titulo="Notas crédito" valor={moneyCompacto(Math.abs(f.monto_notas))} detalle={`${entero(f.notas)} notas`} />
        </Indicadores>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Tarjeta className="lg:col-span-7" titulo="Neto por mes" subtitulo="Histórico mensual del cliente.">
            <ColumnasMes datos={f.periodos.map((p) => ({ periodo: p.periodo, valor: p.neto }))} nombre="Neto" alto="h-56 sm:h-64" />
          </Tarjeta>

          <Tarjeta className="lg:col-span-5" titulo="Compras por categoría" subtitulo="Neto y número de compras. Toca una para ver la categoría.">
            {f.categorias.length ? (
              <ListaBarras
                items={f.categorias.map((c) => ({
                  clave: c.categoria,
                  etiqueta: c.categoria,
                  valor: c.neto,
                  texto: moneyCompacto(c.neto),
                  extra: `${entero(c.ventas)} c.`,
                }))}
                alSeleccionar={(c) => router.push(`/materiales/categorias/${encodeURIComponent(String(c))}`)}
              />
            ) : (
              <p className="py-6 text-center text-sm text-tinta-3">Sin compras en el periodo filtrado.</p>
            )}
          </Tarjeta>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Tarjeta className="lg:col-span-5" titulo="Materiales más comprados" subtitulo="Los 8 primeros por neto. Toca uno para ver el material.">
            {f.materiales.length ? (
              <ListaBarras
                color={COLOR.acento}
                items={f.materiales.map((m) => ({
                  clave: m.codigo,
                  etiqueta: m.nombre,
                  valor: m.neto,
                  texto: moneyCompacto(m.neto),
                  extra: `${entero(m.ventas)} c.`,
                }))}
                alSeleccionar={(c) => router.push(`/materiales/${c}`)}
              />
            ) : (
              <p className="py-6 text-center text-sm text-tinta-3">
                Sin compras en el periodo. Amplía el rango de fechas en Filtros.
              </p>
            )}
          </Tarjeta>

          <Tarjeta className="lg:col-span-7" titulo="Resumen por mes">
            <DataTable
              etiqueta={`Resumen mensual de ${f.cliente.nombre}`}
              columnas={[
                { clave: "periodo", titulo: "Mes", valor: (p) => p.periodo, texto: (p) => mesLargo(p.periodo), render: (p) => <span className="font-medium">{mesLargo(p.periodo)}</span> },
                { clave: "ventas", titulo: "Compras", valor: (p) => p.ventas, numerica: true, formato: "entero" },
                { clave: "notas", titulo: "Notas crédito", valor: (p) => p.notas, numerica: true, formato: "entero" },
                { clave: "neto", titulo: "Neto", valor: (p) => p.neto, numerica: true, barra: true },
              ]}
              filas={f.periodos}
              claveFila={(p) => p.periodo}
              ordenInicial={{ columna: "periodo", direccion: "desc" }}
              porPagina={12}
            />
          </Tarjeta>
        </div>
      </div>

      <Tarjeta
        className="mt-3"
        titulo="Historial de compras"
        subtitulo="Cada línea es un material comprado en un mes; toca una para ver el material. Las notas crédito aparecen en negativo."
        accion={
          <div className="relative w-full sm:w-72">
            <label htmlFor="buscar-material" className="sr-only">
              Buscar material
            </label>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-tinta-3" />
            <input
              id="buscar-material"
              type="search"
              value={busquedaInput}
              onChange={(e) => setBusquedaInput(e.target.value)}
              placeholder="Buscar material"
              maxLength={100}
              className="h-11 w-full rounded-full bg-plano pr-4 pl-11 text-base ring-1 ring-linea transition-shadow outline-none placeholder:text-tinta-3 focus:ring-2 focus:ring-brand sm:text-sm"
            />
          </div>
        }
      >
        {compras.error ? (
          <EstadoCarga error={compras.error} />
        ) : (
          <DataTable
            etiqueta={`Historial de compras de ${f.cliente.nombre}`}
            columnas={columnasCompras}
            filas={compras.datos?.compras ?? []}
            claveFila={(c) => `${c.periodo}-${c.cod_material}`}
            alSeleccionar={(c) => router.push(`/materiales/${c.cod_material}`)}
            porPagina={POR_PAGINA}
            ordenControlado={orden}
            onOrdenar={ordenarPor}
            paginaControlada={pagina}
            onPaginaCambiar={setPagina}
            totalRegistros={compras.datos?.paginacion.total ?? 0}
            cargando={compras.cargando}
          />
        )}
      </Tarjeta>
    </Section>
  );
}
