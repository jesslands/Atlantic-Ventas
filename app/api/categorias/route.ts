import { listarCategorias } from "@/app/lib/api/repos/materiales";
import { leerFiltros } from "@/app/lib/api/filtros";
import { manejar } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (request: Request) => {
  const filtros = leerFiltros(new URL(request.url).searchParams);
  return Response.json({ filtros, categorias: await listarCategorias(filtros) });
});
