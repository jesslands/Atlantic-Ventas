import helmet from "helmet";
import { NextResponse, type NextRequest } from "next/server";

// ponytail: limite en memoria por instancia. Si el API corre en varias replicas,
// mover el contador a Redis/Upstash; mientras tanto cada replica limita por su lado.
const VENTANA_MS = 60_000;
const MAXIMO = Number(process.env.RATE_LIMIT_MAX ?? 120);
const golpes = new Map<string, { cuenta: number; reinicio: number }>();
let proximaLimpieza = Date.now() + VENTANA_MS;

// Identidad sin proxy de confianza delante: todo el trafico directo comparte
// este cupo unico (ver PT-01 en investigacion/Pentesting.md). Es deliberado:
// una cabecera que el cliente controla no es una identidad.
const SIN_PROXY_DE_CONFIANZA = "sin-proxy-de-confianza";
const CONFIA_EN_PROXY = process.env.TRUST_PROXY === "true";

/**
 * x-forwarded-for / x-real-ip las pone el CLIENTE si nadie las sobreescribe.
 * Solo tienen sentido como identidad cuando la unica forma de llegar al
 * contenedor es a traves de un proxy reverso de confianza (Traefik, nginx,
 * ingress) que sea quien efectivamente las fija. En ese caso, el ultimo salto
 * de x-forwarded-for es el que agrego ese proxy; cualquier valor anterior
 * pudo haberlo inventado el cliente. Activar con TRUST_PROXY=true solo si el
 * puerto de la app no es alcanzable sin pasar por ese proxy.
 */
const ip = (request: NextRequest) => {
  if (!CONFIA_EN_PROXY) return SIN_PROXY_DE_CONFIANZA;
  const reenviada = request.headers.get("x-forwarded-for");
  if (reenviada) {
    const saltos = reenviada.split(",").map((valor) => valor.trim());
    return saltos.at(-1) || SIN_PROXY_DE_CONFIANZA;
  }
  return request.headers.get("x-real-ip") ?? SIN_PROXY_DE_CONFIANZA;
};

function limpiarVencidos(ahora: number) {
  if (ahora < proximaLimpieza) return;
  for (const [clave, estado] of golpes) {
    if (ahora > estado.reinicio) golpes.delete(clave);
  }
  proximaLimpieza = ahora + VENTANA_MS;
}

function excedido(clave: string) {
  const ahora = Date.now();
  limpiarVencidos(ahora);
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
  const esApi = request.nextUrl.pathname.startsWith("/api/");

  if (esApi && excedido(ip(request))) {
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
  // Helmet corre en toda la app (API y paginas): el dashboard real tambien
  // necesita HSTS/nosniff/X-Frame-Options y perder X-Powered-By (PT-03).
  proteger(request as never, destino as never, () => {});
  if (esApi) response.headers.set("X-RateLimit-Limit", String(MAXIMO));
  return response;
}

// Todo menos los assets internos de Next: statics/imagenes optimizadas no
// necesitan pasar por rate limit ni por el calculo de cabeceras.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
