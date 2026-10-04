"use client";

import { useRouter } from "next/navigation";
import { entero, moneyCompacto } from "../../lib/analytics";
import { useApi, filtrosAQuery, type FichaCategoria as Ficha } from "../../lib/apiClient";
import { useFiltros } from "../../lib/filtros";
import Section from "../Section";
import { COLOR, ListaBarras } from "./charts";
import { BotonVolver, IndicadoresVentas, MesAMes, TopClientes, titular } from "./SeccionesVentas";
import { EstadoCarga, Tarjeta } from "./ui";

export default function FichaCategoria({ nombre }: { nombre: string }) {
  const router = useRouter();
  const [filtros] = useFiltros();
  const ficha = useApi<Ficha>(`/api/categorias/${encodeURIComponent(nombre)}${filtrosAQuery(filtros)}`, {
    conservar: true,
  });
  const f = ficha.datos?.categoria.toUpperCase() === nombre.toUpperCase() ? ficha.datos : null;
  const titulo = titular(nombre);

  if (ficha.error || !f) {
    return (
      <Section title={titulo} description="Ventas de la categoría con los filtros generales activos.">
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
      description={`Categoría con ${entero(f.materiales)} materiales en el catálogo. Ventas con los filtros generales activos.`}
    >
      <div className="mt-6">
        <BotonVolver respaldo="/materiales" />
      </div>

      <div className={ficha.cargando ? "refrescando" : undefined} aria-busy={ficha.cargando}>
        <IndicadoresVentas f={f} />
        <MesAMes f={f} nombre={titulo.toLowerCase()} />

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <TopClientes f={f} className="lg:col-span-7" />
          <Tarjeta className="lg:col-span-5" titulo="Subcategorías" subtitulo="Neto y número de compras. Toca una para ver su detalle.">
            <ListaBarras
              color={COLOR.acento}
              items={f.subcategorias.map((s) => ({
                clave: s.subcategoria,
                etiqueta: titular(s.subcategoria),
                valor: s.neto,
                texto: moneyCompacto(s.neto),
                extra: `${entero(s.ventas)} c.`,
              }))}
              alSeleccionar={(s) => router.push(`/materiales/subcategorias/${encodeURIComponent(String(s))}`)}
            />
          </Tarjeta>
        </div>

        <Tarjeta className="mt-3" titulo="Materiales más vendidos" subtitulo="Los 10 primeros de la categoría. Toca uno para ver su ficha.">
          <ListaBarras
            items={f.top_materiales.map((m) => ({
              clave: m.codigo,
              etiqueta: m.nombre,
              detalle: m.subcategoria ? titular(m.subcategoria) : undefined,
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
