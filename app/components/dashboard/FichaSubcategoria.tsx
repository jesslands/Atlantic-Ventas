"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { entero, moneyCompacto } from "../../lib/analytics";
import { useApi, filtrosAQuery, type FichaSubcategoria as Ficha } from "../../lib/apiClient";
import { useFiltros } from "../../lib/filtros";
import Section from "../Section";
import { COLOR, ListaBarras, type ItemBarra } from "./charts";
import { BotonVolver, IndicadoresVentas, MesAMes, TopClientes, titular } from "./SeccionesVentas";
import { EstadoCarga, Tarjeta } from "./ui";

const barras = (filas: { nombre: string; neto: number; ventas: number }[]): ItemBarra[] =>
  filas.map((d) => ({
    clave: d.nombre,
    etiqueta: titular(d.nombre),
    valor: d.neto,
    texto: moneyCompacto(d.neto),
    extra: `${entero(d.ventas)} c.`,
  }));

export default function FichaSubcategoria({ nombre }: { nombre: string }) {
  const router = useRouter();
  const [filtros] = useFiltros();
  const ficha = useApi<Ficha>(`/api/subcategorias/${encodeURIComponent(nombre)}${filtrosAQuery(filtros)}`, {
    conservar: true,
  });
  const f = ficha.datos?.subcategoria.toUpperCase() === nombre.toUpperCase() ? ficha.datos : null;
  const titulo = titular(nombre);

  if (ficha.error || !f) {
    return (
      <Section title={titulo} description="Ventas de la subcategoría con los filtros generales activos.">
        <div className="mt-6">
          <BotonVolver respaldo="/materiales" />
        </div>
        <EstadoCarga error={ficha.error} />
      </Section>
    );
  }

  return (
    <Section
      title={titulo}
      description={`Subcategoría de ${titular(f.categoria).toLowerCase()} con ${entero(f.materiales)} materiales en el catálogo. Ventas con los filtros generales activos.`}
    >
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <BotonVolver respaldo="/materiales" />
        <Link
          href={`/materiales/categorias/${encodeURIComponent(f.categoria)}`}
          className="presionable inline-flex h-11 items-center rounded-full bg-dato/10 px-4 text-sm font-medium text-dato hover:bg-dato/15"
        >
          Ver categoría {titular(f.categoria)}
        </Link>
      </div>

      <div className={ficha.cargando ? "refrescando" : undefined} aria-busy={ficha.cargando}>
        <IndicadoresVentas f={f} />
        <MesAMes f={f} nombre={titulo.toLowerCase()} />

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <TopClientes f={f} className="lg:col-span-7" />
          <div className="grid grid-cols-1 gap-3 lg:col-span-5">
            <Tarjeta titulo="Por marca" subtitulo="Neto y número de compras.">
              <ListaBarras color={COLOR.acento} items={barras(f.marcas)} />
            </Tarjeta>
            <Tarjeta titulo="Por calidad" subtitulo="Neto y número de compras.">
              <ListaBarras color={COLOR.acento} items={barras(f.calidades)} />
            </Tarjeta>
          </div>
        </div>

        <Tarjeta className="mt-3" titulo="Materiales más vendidos" subtitulo="Los 10 primeros de la subcategoría. Toca uno para ver su ficha.">
          <ListaBarras
            items={f.top_materiales.map((m) => ({
              clave: m.codigo,
              etiqueta: m.nombre,
              valor: m.neto,
              texto: moneyCompacto(m.neto),
              extra: `${entero(m.ventas)} c.`,
            }))}
            alSeleccionar={(codigo) => router.push(`/materiales/${codigo}`)}
          />
        </Tarjeta>
      </div>
    </Section>
  );
}
