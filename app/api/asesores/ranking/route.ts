import { rankingAsesores } from "@/app/lib/api/consultas";
import { leerFiltros, entero } from "@/app/lib/api/filtros";
import { manejar } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const filtros = leerFiltros(params);
  const limite = entero(params, "limite", 100) ?? 20;
  const ranking = await rankingAsesores(filtros, limite);
  return Response.json({ filtros, ranking });
});
