const PERIODO = /(\d{4})\D+?(\d{1,2})/;
const ISO_PERIODO = /^(\d{4})-(\d{2})/;

export const texto = (valor) => {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return String(valor.text ?? valor.result ?? "").trim();
  return String(valor).trim();
};

export const entero = (valor) => {
  const limpio = texto(valor).replace(/\s/g, "");
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isInteger(numero) ? numero : null;
};

export const normalizarPeriodo = (valor) => {
  const found = PERIODO.exec(texto(valor));
  if (!found) return null;
  const [, anio, mes] = found;
  if (Number(mes) < 1 || Number(mes) > 12) return null;
  return `${anio}-${mes.padStart(2, "0")}-01`;
};

export const etiquetaPeriodo = (iso) => {
  const [, anio, mes] = ISO_PERIODO.exec(iso) ?? [];
  return mes
    ? new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "long", timeZone: "UTC" })
        .format(new Date(Date.UTC(Number(anio), Number(mes) - 1, 1)))
        .replace(" de ", "/")
    : "";
};

export const neto = (valor) => {
  if (typeof valor === "number") return valor;
  const limpio = texto(valor).replace(/\s/g, "");
  return limpio ? Number(limpio) : 0;
};

export const LIMITES_TEXTO = {
  asesores:   { nombre: 80, sede: 40 },
  clientes:   { nombre: 160, tipo: 60 },
  materiales: {
    nombre: 200, categoria: 60, subcategoria: 60, producto_base: 80,
    presentacion: 60, formato: 40, calidad: 40, marca: 60,
  },
};

export const truncar = (tabla, columnas, fila) =>
  fila.map((dato, i) => {
    const max = LIMITES_TEXTO[tabla]?.[columnas[i]];
    return typeof dato === "string" && max ? dato.slice(0, max) : dato;
  });