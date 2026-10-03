import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Next reinyecta X-Powered-By en el render de paginas despues de que el
  // middleware ya la quito (Helmet no alcanza a pisar esa reinyeccion); esta
  // es la via soportada por el framework para que no salga en ningun lado
  // (PT-03 en investigacion/Pentesting.md).
  poweredByHeader: false,
};

export default nextConfig;
