import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Next reinyecta X-Powered-By en el render de paginas despues de que el
  // middleware ya la quito (Helmet no alcanza a pisar esa reinyeccion); esta
  // es la via soportada por el framework para que no salga en ningun lado
  // (PT-03 en investigacion/Pentesting.md).
  poweredByHeader: false,
  experimental: {
    // proxy.ts corre sobre /api y Next guarda en memoria el cuerpo de cada
    // peticion que pasa por el (por defecto corta en 10 MB). El Excel sube en
    // partes de 32 MB (TAMANO_PARTE en app/lib/api/subidas.ts): este tope solo
    // tiene que cubrir una parte, no el archivo entero.
    proxyClientMaxBodySize: "40mb",
  },
};

export default nextConfig;
