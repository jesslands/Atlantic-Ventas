import { proyectar } from "@/app/lib/api/analitica";
import { serieMensual } from "@/app/lib/api/repos/ventas";
import { leerFiltros } from "@/app/lib/api/filtros";
import { manejar } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (request: Request) => {
  const filtros = leerFiltros(new URL(request.url).searchParams);
  const real = await serieMensual(filtros);
  return Response.json({ filtros, serie: proyectar(real) });
});
