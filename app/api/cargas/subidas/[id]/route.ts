import { manejar, peticionInvalida } from "@/app/lib/api/http";
import { agregarParte, borrarSubida } from "@/app/lib/api/subidas";

export const dynamic = "force-dynamic";

/** Anexa una parte: ?desde=<bytes ya recibidos>, cuerpo = bytes crudos. */
export const PUT = manejar(
  async (request: Request, ctx: RouteContext<"/api/cargas/subidas/[id]">) => {
    const { id } = await ctx.params;
    const desde = Number(new URL(request.url).searchParams.get("desde"));
    if (!Number.isInteger(desde) || desde < 0) {
      throw peticionInvalida('"desde" debe ser la cantidad de bytes ya recibidos.');
    }
    return Response.json(await agregarParte(id, desde, request));
  },
);

/** Descarta una subida (el usuario canceló antes de procesarla). */
export const DELETE = manejar(
  async (_request: Request, ctx: RouteContext<"/api/cargas/subidas/[id]">) => {
    const { id } = await ctx.params;
    await borrarSubida(id);
    return new Response(null, { status: 204 });
  },
);
