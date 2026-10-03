import { historialCliente } from "@/app/lib/api/repos/clientes";
import { leerFiltros } from "@/app/lib/api/filtros";
import { manejar, peticionInvalida } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(
  async (request: Request, ctx: RouteContext<"/api/clientes/[codigo]">) => {
    const { codigo } = await ctx.params;
    if (!/^\d{1,12}$/.test(codigo)) {
      throw peticionInvalida('"codigo" debe ser el codigo numerico del cliente.', { codigo });
    }
    const filtros = leerFiltros(new URL(request.url).searchParams);
    return Response.json({ filtros, ...(await historialCliente(Number(codigo), filtros)) });
  },
);
