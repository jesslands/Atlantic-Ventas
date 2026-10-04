import { leerOrdenMaterial, listarMateriales } from "@/app/lib/api/repos/materiales";
import { entero, leerFiltros } from "@/app/lib/api/filtros";
import { manejar, peticionInvalida } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const filtros = leerFiltros(params);
  // 2.794 materiales hoy: 500 páginas de 100 cubren el catálogo con holgura.
  const pagina = entero(params, "pagina", 500) ?? 1;
  const porPagina = entero(params, "porPagina", 100) ?? 20;
  const direccion = (params.get("dir") ?? "desc").toLowerCase();
  if (direccion !== "asc" && direccion !== "desc") {
    throw peticionInvalida('"dir" debe ser "asc" o "desc".', { dir: direccion });
  }
  const busqueda = params.get("q")?.trim() || undefined;
  if (busqueda && busqueda.length > 100) {
    throw peticionInvalida('"q" admite máximo 100 caracteres.', { q: busqueda.slice(0, 120) });
  }
  const categoria = params.get("categoria")?.trim().toUpperCase() || undefined;
  if (categoria && !/^[A-ZÁÉÍÓÚÑ0-9 ._-]{1,60}$/.test(categoria)) {
    throw peticionInvalida('"categoria" debe ser una categoría del catálogo.', { categoria: categoria.slice(0, 80) });
  }

  const materiales = await listarMateriales(filtros, {
    busqueda,
    categoria,
    orden: leerOrdenMaterial(params.get("orden") ?? undefined),
    direccion,
    pagina,
    porPagina,
  });

  return Response.json({
    filtros,
    paginacion: { pagina, porPagina, total: materiales[0]?.total ?? 0 },
    materiales: materiales.map((m) => ({
      cod_material: m.cod_material,
      nombre: m.nombre,
      categoria: m.categoria,
      subcategoria: m.subcategoria,
      marca: m.marca,
      neto: m.neto,
      ventas: m.ventas,
      clientes: m.clientes,
    })),
  });
});
