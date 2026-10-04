"use client";

import Link from "next/link";
import { useApi, filtrosAQuery, type FichaMaterial as Ficha } from "../../lib/apiClient";
import { useFiltros } from "../../lib/filtros";
import Section from "../Section";
import { BotonVolver, IndicadoresVentas, MesAMes, TopClientes, titular } from "./SeccionesVentas";
import { EstadoCarga, Tarjeta } from "./ui";

export default function FichaMaterial({ codigo }: { codigo: string }) {
  const [filtros] = useFiltros();
  const ficha = useApi<Ficha>(`/api/materiales/${codigo}${filtrosAQuery(filtros)}`, { conservar: true });
  // Los datos conservados de otro material no sirven al cambiar de ruta.
  const f = ficha.datos?.material.codigo === Number(codigo) ? ficha.datos : null;

  if (ficha.error || !f) {
    return (
      <Section title="Material" description="Ventas del material con los filtros generales activos.">
        <div className="mt-6">
          <BotonVolver respaldo="/materiales" />
        </div>
        <EstadoCarga error={ficha.error} />
      </Section>
    );
  }

  const m = f.material;
  const atributos = [
    ["Categoría", m.categoria],
    ["Subcategoría", m.subcategoria],
    ["Producto base", m.producto_base],
    ["Presentación", m.presentacion],
    ["Formato", m.formato],
    ["Calidad", m.calidad],
    ["Marca", m.marca],
  ].filter((a): a is [string, string] => Boolean(a[1]));
  const enlaces: Record<string, string> = {
    ...(m.categoria && { Categoría: `/materiales/categorias/${encodeURIComponent(m.categoria)}` }),
    ...(m.subcategoria && { Subcategoría: `/materiales/subcategorias/${encodeURIComponent(m.subcategoria)}` }),
  };

  return (
    <Section
      title={m.nombre}
      description={`Material ${m.codigo}${m.marca ? ` de la marca ${m.marca}` : ""}. Ventas con los filtros generales activos.`}
    >
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <BotonVolver respaldo="/materiales" />
        {m.categoria && (
          <Link
            href={`/materiales/categorias/${encodeURIComponent(m.categoria)}`}
            className="presionable inline-flex h-11 items-center rounded-full bg-dato/10 px-4 text-sm font-medium text-dato hover:bg-dato/15"
          >
            Ver categoría {titular(m.categoria)}
          </Link>
        )}
        {m.subcategoria && (
          <Link
            href={`/materiales/subcategorias/${encodeURIComponent(m.subcategoria)}`}
            className="presionable inline-flex h-11 items-center rounded-full bg-dato/10 px-4 text-sm font-medium text-dato hover:bg-dato/15"
          >
            Ver subcategoría {titular(m.subcategoria)}
          </Link>
        )}
      </div>

      <div className={ficha.cargando ? "refrescando" : undefined} aria-busy={ficha.cargando}>
        <IndicadoresVentas f={f} />
        <MesAMes f={f} nombre={m.nombre.toLowerCase()} />

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <TopClientes f={f} className="lg:col-span-7" />
          <Tarjeta className="lg:col-span-5" titulo="Ficha del material">
            <dl className="divide-y divide-linea text-sm">
              {atributos.map(([nombre, valor]) => (
                <div key={nombre} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-tinta-3">{nombre}</dt>
                  <dd className="text-right font-medium">
                    {enlaces[nombre] ? (
                      <Link href={enlaces[nombre]} className="text-dato underline decoration-dato/30 underline-offset-4 hover:decoration-dato">
                        {valor}
                      </Link>
                    ) : (
                      valor
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Tarjeta>
        </div>
      </div>
    </Section>
  );
}
