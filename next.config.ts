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
    // peticion que pasa por el; por defecto corta en 10 MB y el libro de ventas
    // pesa mas. Mismo tope que valida POST /api/cargas.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
