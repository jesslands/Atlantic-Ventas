import { peticionInvalida } from "./http.ts";

export type Filtros = {
  desde?: string;
  hasta?: string;
  sedes: string[];
  asesores: string[];
};

export const filtrosVacios: Filtros = { sedes: [], asesores: [] };

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
const ASESOR = /^ASE-\d{3}$/;
const TEXTO = /^[A-ZÁÉÍÓÚÑ0-9 ._-]{1,60}$/i;
const ENTERO_POSITIVO = /^\d{1,6}$/;

const lista = (params: URLSearchParams, nombre: string) =>
  params
    .getAll(nombre)
    .flatMap((valor) => valor.split(","))
    .map((valor) => valor.trim())
    .filter(Boolean);

const unico = <T>(valores: T[], nombre: string): T | undefined => {
  if (valores.length > 1) {
    throw peticionInvalida(`El parámetro "${nombre}" admite un solo valor.`, {
      [nombre]: valores,
    });
  }
  return valores[0];
};

const periodo = (params: URLSearchParams, nombre: string) => {
  const valor = unico(lista(params, nombre), nombre)?.toUpperCase();
  if (!valor) return undefined;
  if (!PERIODO.test(valor)) {
    throw peticionInvalida(
      `"${nombre}" debe tener formato YYYY-MM con un mes entre 01 y 12.`,
      { [nombre]: valor },
    );
  }
  return valor;
};

const codigos = (params: URLSearchParams, nombre: string) => {
  const valores = lista(params, nombre);
  for (const valor of valores) {
    if (nombre === "asesor" ? !ASESOR.test(valor.toUpperCase()) : !TEXTO.test(valor)) {
      throw peticionInvalida(
        `"${nombre}" solo admite los valores del catálogo cargado.`,
        { [nombre]: valor },
      );
    }
  }
  return [...new Set(valores.map((valor) => valor.toUpperCase()))];
};

export const entero = (params: URLSearchParams, nombre: string, max: number) => {
  const valor = unico(lista(params, nombre), nombre);
  if (!valor) return undefined;
  if (!ENTERO_POSITIVO.test(valor) || Number(valor) > max) {
    throw peticionInvalida(`"${nombre}" debe ser un entero entre 1 y ${max}.`, {
      [nombre]: valor,
    });
  }
  return Number(valor);
};

/** Filtros comunes a todos los endpoints de cifras: desde, hasta, sede, asesor. */
export const leerFiltros = (params: URLSearchParams): Filtros => {
  const desde = periodo(params, "desde");
  const hasta = periodo(params, "hasta");
  if (desde && hasta && desde > hasta) {
    throw peticionInvalida('"desde" no puede ser posterior a "hasta".', { desde, hasta });
  }
  return {
    desde,
    hasta,
    sedes: codigos(params, "sede"),
    asesores: codigos(params, "asesor"),
  };
};

/** "2026-03" -> "2026-03-01": el primer dia, que es como se guarda el DATE. */
export const comoFecha = (periodo: string) => `${periodo}-01`;

/** Desplaza un periodo YYYY-MM n meses (n negativo hacia atrás). */
export const moverPeriodo = (periodoBase: string, meses: number) => {
  const [anio, mes] = periodoBase.split("-").map(Number);
  const total = anio * 12 + (mes - 1) + meses;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
};
