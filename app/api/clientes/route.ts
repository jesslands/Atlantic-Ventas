import { leerOrden, listarClientes } from "@/app/lib/api/repos/clientes";
import { entero, leerFiltros } from "@/app/lib/api/filtros";
import { manejar, peticionInvalida } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const filtros = leerFiltros(params);
  // Tope bajado de 100_000 a 2_000 (PT-04 en investigacion/Pentesting.md):
  // con porPagina=100 el OFFSET maximo pasa de 10.000.000 a 199.900 filas,
  // de sobra para paginar todo el catalogo actual (11.288 clientes) sin
  // dejar una consulta gratis-para-el-atacante y cara-para-Postgres.
  const pagina = entero(params, "pagina", 2_000) ?? 1;
  const porPagina = entero(params, "porPagina", 100) ?? 20;
  const direccion = (params.get("dir") ?? "desc").toLowerCase();
  if (direccion !== "asc" && direccion !== "desc") {
    throw peticionInvalida('"dir" debe ser "asc" o "desc".', { dir: direccion });
  }
  const busqueda = params.get("q")?.trim() || undefined;
  if (busqueda && busqueda.length > 100) {
    throw peticionInvalida('"q" admite máximo 100 caracteres.', { q: busqueda.slice(0, 120) });
  }

  const clientes = await listarClientes(filtros, {
    busqueda,
    orden: leerOrden(params.get("orden") ?? undefined),
    direccion,
    pagina,
    porPagina,
  });

  return Response.json({
    filtros,
    paginacion: { pagina, porPagina, total: clientes[0]?.total ?? 0 },
    clientes,
  });
});
