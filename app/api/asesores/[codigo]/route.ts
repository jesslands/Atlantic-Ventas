import { historialAsesor } from "@/app/lib/api/repos/asesores";
import { leerFiltros } from "@/app/lib/api/filtros";
import { manejar, peticionInvalida } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(
  async (request: Request, ctx: RouteContext<"/api/asesores/[codigo]">) => {
    const { codigo } = await ctx.params;
    const normalizado = codigo.toUpperCase();
    if (!/^ASE-\d{3}$/.test(normalizado)) {
      throw peticionInvalida('"codigo" debe tener el formato ASE-###.', { codigo });
    }
    const filtros = leerFiltros(new URL(request.url).searchParams);
    return Response.json({ filtros, ...(await historialAsesor(normalizado, filtros)) });
  },
);
