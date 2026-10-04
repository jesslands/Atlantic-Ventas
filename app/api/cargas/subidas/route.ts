import { manejar } from "@/app/lib/api/http";
import { crearSubida } from "@/app/lib/api/subidas";

export const dynamic = "force-dynamic";

/** Abre una subida por partes: { tamano } -> { id, tamano, tamano_parte }. */
export const POST = manejar(async (request: Request) => {
  const cuerpo = await request.json().catch(() => null);
  return Response.json(await crearSubida(cuerpo?.tamano), { status: 201 });
});
