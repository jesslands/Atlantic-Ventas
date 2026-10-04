/** Formato de números y moneda compartido por los componentes del dashboard. */

const nf = new Intl.NumberFormat("es-CO");
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

export const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${nf.format(Math.round(Math.abs(n)))}`;

export const moneyCompacto = (n: number) => {
  const abs = Math.abs(n);
  const signo = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${signo}$${nf1.format(abs / 1e9)} mil M`;
  if (abs >= 1e6) return `${signo}$${nf.format(Math.round(abs / 1e6))} M`;
  if (abs >= 1e3) return `${signo}$${nf.format(Math.round(abs / 1e3))} k`;
  return money(n);
};

export const entero = (n: number) => nf.format(n);

/** Variación porcentual contra un valor de referencia (igual a la del API). */
export const variacion = (actual: number, anterior: number) =>
  anterior ? ((actual - anterior) / Math.abs(anterior)) * 100 : 0;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-03" → "mar". */
export const mesCorto = (periodo: string) => MESES[Number(periodo.slice(5, 7)) - 1] ?? periodo;

/** "2026-03" → "mar 2026". */
export const mesLargo = (periodo: string) => `${mesCorto(periodo)} ${periodo.slice(0, 4)}`;

/** Porcentaje con signo explícito: +4,2 % / -13,8 %. */
export const pctSigno = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "-" : ""}${nf1.format(Math.abs(n))} %`;
