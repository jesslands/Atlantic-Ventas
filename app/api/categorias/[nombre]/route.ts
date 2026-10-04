import { fichaCategoria } from "@/app/lib/api/repos/materiales";
import { leerFiltros } from "@/app/lib/api/filtros";
import { manejar, peticionInvalida } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(
  async (request: Request, ctx: RouteContext<"/api/categorias/[nombre]">) => {
    // Next ya entrega el segmento decodificado: decodificarlo otra vez rompía con "%".
    const { nombre } = await ctx.params;
    if (!/^[A-ZÁÉÍÓÚÑ0-9 ._-]{1,60}$/i.test(nombre)) {
      throw peticionInvalida('"nombre" debe ser una categoría del catálogo.', { nombre: nombre.slice(0, 80) });
    }
    const filtros = leerFiltros(new URL(request.url).searchParams);
    return Response.json({ filtros, ...(await fichaCategoria(nombre, filtros)) });
  },
);
