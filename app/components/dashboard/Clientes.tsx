"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApi, filtrosAQuery, type ClienteListado } from "../../lib/apiClient";
import { useFiltros } from "../../lib/filtros";
import DataTable, { type Columna } from "./DataTable";
import Section from "../Section";
import { EstadoCarga, Tarjeta } from "./ui";

const POR_PAGINA = 20;
const ORDENES_API = new Set(["neto", "ventas", "ultimaCompra", "nombre", "codigo"]);

const titular = (texto: string) => texto.charAt(0) + texto.slice(1).toLowerCase();

const columnas: Columna<ClienteListado>[] = [
  {
    clave: "nombre",
    titulo: "Cliente",
    valor: (f) => f.nombre,
    secundario: (f) => `${titular(f.sede)} · ${f.tipo}`,
    render: (f) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{f.nombre}</p>
        <p className="truncate text-xs text-tinta-3">
          {f.cod_cliente} · {f.tipo}
        </p>
      </div>
    ),
  },
  { clave: "sede", titulo: "Sede", valor: (f) => titular(f.sede), sinOrden: true },
  { clave: "ventas", titulo: "Ventas", valor: (f) => f.ventas, numerica: true, formato: "entero", enMovil: true },
  {
    clave: "ticketMedio",
    titulo: "Ticket medio",
    valor: (f) => (f.ventas ? f.neto / f.ventas : 0),
    numerica: true,
    sinOrden: true,
  },
  {
    clave: "montoNotas",
    titulo: "Nota crédito",
    valor: (f) => f.monto_notas,
    numerica: true,
    sinOrden: true,
  },
  { clave: "ultimaCompra", titulo: "Última compra", valor: (f) => f.ultima_compra, enMovil: true },
  { clave: "neto", titulo: "Neto", valor: (f) => f.neto, numerica: true, barra: true },
];

export default function Clientes() {
  const [filtros] = useFiltros();
  const [busquedaInput, setBusquedaInput] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<{ columna: string; direccion: "asc" | "desc" }>({
    columna: "neto",
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

  const listado = useApi<{ clientes: ClienteListado[]; paginacion: { total: number } }>(
    `/api/clientes${filtrosAQuery(filtros, {
      q: busqueda || undefined,
      orden: orden.columna,
      dir: orden.direccion,
      pagina: pagina + 1,
      porPagina: POR_PAGINA,
    })}`,
    { conservar: true },
  );


  const ordenarPor = (clave: string) => {
    if (!ORDENES_API.has(clave)) return; // sede/ticketMedio/montoNotas: sin equivalente en la API
    setOrden((prev) =>
      prev.columna === clave
        ? { columna: clave, direccion: prev.direccion === "asc" ? "desc" : "asc" }
        : { columna: clave, direccion: "desc" },
    );
    setPagina(0);
  };

  const router = useRouter();
  const abrir = (c: number) => router.push(`/clientes/${c}`);

  return (
    <Section
      title="Clientes"
      description="Busca, ordena y abre la ficha de cualquier cliente para revisar su historial de compras."
    >
      <div className="mt-6">
        <label htmlFor="buscar-cliente" className="mb-2 block text-sm font-medium">
          Buscar cliente
        </label>
        <div className="relative max-w-md">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-tinta-3"
          />
          <input
            id="buscar-cliente"
            type="search"
            value={busquedaInput}
            onChange={(e) => setBusquedaInput(e.target.value)}
            placeholder="Nombre del cliente"
            maxLength={100}
            className="h-11 w-full rounded-full bg-superficie pr-4 pl-11 text-base shadow-[0_1px_2px_rgba(87,82,44,0.08)] ring-1 ring-linea transition-shadow outline-none placeholder:text-tinta-3 focus:ring-2 focus:ring-brand sm:text-sm"
          />
        </div>
      </div>

      {listado.error ? (
        <EstadoCarga error={listado.error} />
      ) : (
        <Tarjeta className="mt-4" titulo="Listado de clientes">
          <DataTable
            etiqueta="Listado de clientes"
            columnas={columnas}
            filas={listado.datos?.clientes ?? []}
            claveFila={(f) => f.cod_cliente}
            alSeleccionar={(f) => abrir(f.cod_cliente)}
            porPagina={POR_PAGINA}
            ordenControlado={orden}
            onOrdenar={ordenarPor}
            paginaControlada={pagina}
            onPaginaCambiar={setPagina}
            totalRegistros={listado.datos?.paginacion.total ?? 0}
            cargando={listado.cargando}
          />
        </Tarjeta>
      )}
    </Section>
  );
}
