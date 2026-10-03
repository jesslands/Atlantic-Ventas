import helmet from "helmet";
import { NextResponse, type NextRequest } from "next/server";

// ponytail: limite en memoria por instancia. Si el API corre en varias replicas,
// mover el contador a Redis/Upstash; mientras tanto cada replica limita por su lado.
const VENTANA_MS = 60_000;
const MAXIMO = Number(process.env.RATE_LIMIT_MAX ?? 120);
const golpes = new Map<string, { cuenta: number; reinicio: number }>();

const ip = (request: NextRequest) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
  request.headers.get("x-real-ip") ??
  "desconocida";

function excedido(clave: string) {
  const ahora = Date.now();
  const estado = golpes.get(clave);
  if (!estado || ahora > estado.reinicio) {
    golpes.set(clave, { cuenta: 1, reinicio: ahora + VENTANA_MS });
    return false;
  }
  estado.cuenta += 1;
  return estado.cuenta > MAXIMO;
}

// ponytail: CSP queda fuera a proposito — el API responde JSON y las paginas de la
// rama UI necesitan los scripts inline de Next. Se define ahi cuando se ajusten.
const proteger = helmet({ contentSecurityPolicy: false });

export function proxy(request: NextRequest) {
  if (excedido(ip(request))) {
    return Response.json(
      { error: { codigo: "DEMASIADAS_SOLICITUDES", mensaje: "Límite de peticiones superado. Reintenta en un minuto." } },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const response = NextResponse.next();
  const destino = {
    setHeader: (clave: string, valor: string | number) => response.headers.set(clave, String(valor)),
    removeHeader: (clave: string) => response.headers.delete(clave),
  };
  proteger(request as never, destino as never, () => {});
  response.headers.set("X-RateLimit-Limit", String(MAXIMO));
  return response;
}

export const config = { matcher: "/api/:path*" };
