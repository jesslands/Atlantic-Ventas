import { proyectar } from "@/app/lib/api/analitica";
import { serieMensual } from "@/app/lib/api/repos/ventas";
import { leerFiltros } from "@/app/lib/api/filtros";
import { manejar } from "@/app/lib/api/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (request: Request) => {
  const filtros = leerFiltros(new URL(request.url).searchParams);
  const real = await serieMensual(filtros);
  // proyectar() es puro y solo conoce periodo/neto; el resto de columnas que ya
  // trae cada fila real (ventas, notas, clientes, ticket_mediano) se reinyectan
  // aqui para que el dashboard no tenga que volver a pedirlas aparte.
  const serie = proyectar(real).map((punto, indice) => {
    const fila = real[indice];
    return {
      ...punto,
      ventas: fila?.ventas ?? null,
      notas: fila?.notas ?? null,
      montoNotas: fila?.monto_notas ?? null,
      clientes: fila?.clientes ?? null,
      ticketMediano: fila?.ticket_mediano ?? null,
    };
  });
  return Response.json({ filtros, serie });
});
