"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { entero, moneyCompacto } from "../../lib/analytics";
import { useApi, filtrosAQuery, type FilaCategoria, type MaterialListado } from "../../lib/apiClient";
import { useFiltros } from "../../lib/filtros";
import DataTable, { type Columna } from "./DataTable";
import Section from "../Section";
import { COLOR, ListaBarras } from "./charts";
import { titular } from "./SeccionesVentas";
import { EstadoCarga, Indicadores, Kpi, Tarjeta } from "./ui";

const POR_PAGINA = 20;
const ORDENES_API = new Set(["neto", "ventas", "clientes", "nombre", "codigo"]);

const columnas: Columna<MaterialListado>[] = [
  {
    clave: "nombre",
    titulo: "Material",
    valor: (m) => m.nombre,
    secundario: (m) => [m.categoria && titular(m.categoria), m.marca].filter(Boolean).join(" · "),
    render: (m) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{m.nombre}</p>
        <p className="truncate text-xs text-tinta-3">
          {m.cod_material} · {[m.categoria && titular(m.categoria), m.subcategoria && titular(m.subcategoria), m.marca].filter(Boolean).join(" · ")}
        </p>
      </div>
    ),
  },
  { clave: "clientes", titulo: "Clientes", valor: (m) => m.clientes, numerica: true, formato: "entero", enMovil: true },
  { clave: "ventas", titulo: "Compras", valor: (m) => m.ventas, numerica: true, formato: "entero", enMovil: true },
  { clave: "neto", titulo: "Neto", valor: (m) => m.neto, numerica: true, barra: true },
];

export default function Materiales() {
  const router = useRouter();
  const [filtros] = useFiltros();
  const [categoria, setCategoria] = useState("");
  const [busquedaInput, setBusquedaInput] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<{ columna: string; direccion: "asc" | "desc" }>({ columna: "neto", direccion: "desc" });
  const [pagina, setPagina] = useState(0);

  // Debounce: no dispara una petición por cada tecla.
  useEffect(() => {
    const id = setTimeout(() => {
      setBusqueda(busquedaInput);
      setPagina(0);
    }, 300);
    return () => clearTimeout(id);
  }, [busquedaInput]);

  const categorias = useApi<{ categorias: FilaCategoria[] }>(`/api/categorias${filtrosAQuery(filtros)}`, { conservar: true });
  const listado = useApi<{ materiales: MaterialListado[]; paginacion: { total: number } }>(
    `/api/materiales${filtrosAQuery(filtros, {
      q: busqueda || undefined,
      categoria: categoria || undefined,
      orden: orden.columna,
      dir: orden.direccion,
      pagina: pagina + 1,
      porPagina: POR_PAGINA,
    })}`,
    { conservar: true },
  );
  const top = useApi<{ materiales: MaterialListado[] }>(
    `/api/materiales${filtrosAQuery(filtros, { orden: "neto", dir: "desc", porPagina: 10 })}`,
    { conservar: true },
  );

  const ordenarPor = (clave: string) => {
    if (!ORDENES_API.has(clave)) return;
    setOrden((prev) =>
      prev.columna === clave
        ? { columna: clave, direccion: prev.direccion === "asc" ? "desc" : "asc" }
        : { columna: clave, direccion: clave === "nombre" ? "asc" : "desc" },
    );
    setPagina(0);
  };

  const descripcion = "Ventas por categoría y por material. Toca una categoría o un material para ver su detalle mes a mes.";
  const error = categorias.error ?? top.error;

  if (error || !categorias.datos || !top.datos) {
    return (
      <Section title="Materiales" description={descripcion}>
        <EstadoCarga error={error} />
      </Section>
    );
  }

  const cats = categorias.datos.categorias;
  const neto = cats.reduce((suma, c) => suma + c.neto, 0);
  const materialesVendidos = cats.reduce((suma, c) => suma + c.materiales, 0);
  const irACategoria = (c: string | number) => router.push(`/materiales/categorias/${encodeURIComponent(String(c))}`);

  return (
    <Section title="Materiales" description={descripcion}>
      <div className={categorias.cargando || top.cargando ? "refrescando" : undefined}>
        <Indicadores>
          <Kpi titulo="Neto" valor={moneyCompacto(neto)} />
          <Kpi titulo="Categorías" valor={entero(cats.length)} />
          <Kpi titulo="Materiales vendidos" valor={entero(materialesVendidos)} />
        </Indicadores>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Tarjeta className="lg:col-span-5" titulo="Neto por categoría" subtitulo="Participación en el neto del periodo.">
            <ListaBarras
              items={cats.map((c) => ({
                clave: c.categoria,
                etiqueta: titular(c.categoria),
                detalle: `${entero(c.materiales)} materiales · ${entero(c.clientes)} clientes`,
                valor: c.neto,
                texto: moneyCompacto(c.neto),
                extra: `${c.participacion.toFixed(1).replace(".", ",")} %`,
              }))}
              alSeleccionar={irACategoria}
            />
          </Tarjeta>
          <Tarjeta className="lg:col-span-7" titulo="Materiales más vendidos" subtitulo="Los 10 primeros por neto.">
            <ListaBarras
              color={COLOR.acento}
              items={top.datos.materiales.map((m) => ({
                clave: m.cod_material,
                etiqueta: m.nombre,
                detalle: m.categoria ? `${titular(m.categoria)} · ${entero(m.clientes)} clientes` : undefined,
                valor: m.neto,
                texto: moneyCompacto(m.neto),
              }))}
              alSeleccionar={(c) => router.push(`/materiales/${c}`)}
            />
          </Tarjeta>
        </div>
      </div>

      <Tarjeta
        className="mt-3"
        titulo="Catálogo de materiales"
        accion={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label htmlFor="categoria-material" className="sr-only">
              Categoría
            </label>
            <select
              id="categoria-material"
              value={categoria}
              onChange={(e) => {
                setCategoria(e.target.value);
                setPagina(0);
              }}
              className="h-11 rounded-full border border-linea bg-plano px-4 text-sm"
            >
              <option value="">Todas las categorías</option>
              {cats.map((c) => (
                <option key={c.categoria} value={c.categoria}>
                  {titular(c.categoria)}
                </option>
              ))}
            </select>
            <div className="relative sm:w-64">
              <label htmlFor="buscar-material-catalogo" className="sr-only">
                Buscar material
              </label>
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-tinta-3" />
              <input
                id="buscar-material-catalogo"
                type="search"
                value={busquedaInput}
                onChange={(e) => setBusquedaInput(e.target.value)}
                placeholder="Buscar material"
                maxLength={100}
                className="h-11 w-full rounded-full bg-plano pr-4 pl-11 text-base ring-1 ring-linea outline-none placeholder:text-tinta-3 focus:ring-2 focus:ring-brand sm:text-sm"
              />
            </div>
          </div>
        }
      >
        {listado.error ? (
          <EstadoCarga error={listado.error} />
        ) : (
          <DataTable
            etiqueta="Catálogo de materiales"
            columnas={columnas}
            filas={listado.datos?.materiales ?? []}
            claveFila={(m) => m.cod_material}
            alSeleccionar={(m) => router.push(`/materiales/${m.cod_material}`)}
            porPagina={POR_PAGINA}
            ordenControlado={orden}
            onOrdenar={ordenarPor}
            paginaControlada={pagina}
            onPaginaCambiar={setPagina}
            totalRegistros={listado.datos?.paginacion.total ?? 0}
            cargando={listado.cargando}
          />
        )}
      </Tarjeta>
    </Section>
  );
}
