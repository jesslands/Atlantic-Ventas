import { comprasCliente, leerOrdenCompra } from "@/app/lib/api/repos/clientes";
import { entero, leerFiltros } from "@/app/lib/api/filtros";
import { manejar, peticionInvalida } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(
  async (request: Request, ctx: RouteContext<"/api/clientes/[codigo]/compras">) => {
    const { codigo } = await ctx.params;
    if (!/^\d{1,12}$/.test(codigo)) {
      throw peticionInvalida('"codigo" debe ser el código numérico del cliente.', { codigo });
    }
    const params = new URL(request.url).searchParams;
    const filtros = leerFiltros(params);
    // Un cliente tiene a lo sumo meses × materiales filas: 500 páginas de 100 sobran.
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

    const compras = await comprasCliente(Number(codigo), filtros, {
      busqueda,
      orden: leerOrdenCompra(params.get("orden") ?? undefined),
      direccion,
      pagina,
      porPagina,
    });

    return Response.json({
      filtros,
      paginacion: { pagina, porPagina, total: compras[0]?.total ?? 0 },
      compras: compras.map((c) => ({
        periodo: c.periodo,
        cod_material: c.cod_material,
        material: c.material,
        categoria: c.categoria,
        neto: c.neto,
        nota_credito: c.nota_credito,
      })),
    });
  },
);
