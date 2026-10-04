import { fichaMaterial } from "@/app/lib/api/repos/materiales";
import { leerFiltros } from "@/app/lib/api/filtros";
import { manejar, peticionInvalida } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(
  async (request: Request, ctx: RouteContext<"/api/materiales/[codigo]">) => {
    const { codigo } = await ctx.params;
    if (!/^\d{1,12}$/.test(codigo)) {
      throw peticionInvalida('"codigo" debe ser el código numérico del material.', { codigo });
    }
    const filtros = leerFiltros(new URL(request.url).searchParams);
    return Response.json({ filtros, ...(await fichaMaterial(Number(codigo), filtros)) });
  },
);
