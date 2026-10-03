import ExcelJS from "exceljs";

const HOJA_VENTAS = "Ventas";

const texto = (valor) => {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return String(valor.text ?? valor.result ?? "").trim();
  return String(valor).trim();
};

export const hoja = async function* (archivo, solo) {
  const lector = new ExcelJS.stream.xlsx.WorkbookReader(archivo, { worksheets: "emit" });
  for await (const worksheet of lector) {
    const wanted = solo ? solo === worksheet.name : worksheet.name !== HOJA_VENTAS;
    if (!wanted) continue;
    const columnas = [];
    for await (const fila of worksheet) {
      const celdas = fila.values;
      if (!columnas.length) {
        for (let columna = 1; columna < celdas.length; columna += 1) {
          columnas.push(texto(celdas[columna]).toUpperCase());
        }
        continue;
      }
      yield { hoja: worksheet.name, celdas, columnas };
    }
  }
};

export const valor = ({ celdas, columnas }, nombre) => {
  const indice = columnas.indexOf(nombre);
  return indice === -1 ? null : celdas[indice + 1];
};