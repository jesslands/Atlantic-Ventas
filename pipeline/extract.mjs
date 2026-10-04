import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { Transform } from "node:stream";
import ExcelJS from "exceljs";

const HOJA_VENTAS = "Ventas";

const texto = (valor) => {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return String(valor.text ?? valor.result ?? "").trim();
  return String(valor).trim();
};

// Filas de datos que declara <dimension ref="A1:F446743"/> al inicio de la hoja,
// sin recorrerla. null si el libro no la trae.
const filasDeclaradas = async (worksheet) => {
  let inicio = "";
  for await (const chunk of worksheet.iterator) {
    inicio += chunk.toString("utf8");
    const dimension = /<dimension\s+ref="[A-Z]+\d+(?::[A-Z]+(\d+))?"/.exec(inicio);
    if (dimension) return dimension[1] ? Math.max(0, Number(dimension[1]) - 1) : 0;
    if (inicio.includes("<sheetData") || inicio.length > 64 * 1024) return null;
  }
  return null;
};

// alLeer recibe los bytes del archivo consumidos hasta ahora. Ojo: si el libro
// guarda sharedStrings despues de las hojas, ExcelJS lee todo el zip antes de
// emitir la primera fila, asi que los bytes solo miden esa lectura inicial.
// alContarVentas recibe las filas que declara la hoja de ventas cuando se salta.
export const hoja = async function* (archivo, solo, { alLeer, alContarVentas } = {}) {
  const entrada = createReadStream(archivo);
  let leidos = 0;
  const contador = new Transform({
    transform(chunk, _codificacion, listo) {
      leidos += chunk.length;
      alLeer?.(leidos);
      listo(null, chunk);
    },
  });
  entrada.on("error", (error) => contador.destroy(error));
  const lector = new ExcelJS.stream.xlsx.WorkbookReader(entrada.pipe(contador), {
    worksheets: "emit",
  });
  try {
    for await (const worksheet of lector) {
      const wanted = solo ? solo === worksheet.name : worksheet.name !== HOJA_VENTAS;
      if (!wanted) {
        if (worksheet.name === HOJA_VENTAS && alContarVentas) {
          alContarVentas(await filasDeclaradas(worksheet));
        }
        continue;
      }
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
  } finally {
    // Si el recorrido se corta (cancelacion o error) el archivo no queda abierto.
    entrada.destroy();
    contador.destroy();
  }
};

export class LibroInvalido extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "LibroInvalido";
  }
}

// Un .xlsx es un zip, que termina con el registro "fin de directorio central"
// (PK\x05\x06) en sus ultimos 64 KB. Si falta, el archivo llego cortado o esta
// danado; hay que detectarlo antes de leer porque ExcelJS, ante un zip
// truncado, se queda esperando para siempre en vez de fallar.
export const validarLibro = async (archivo) => {
  const descriptor = await open(archivo, "r");
  try {
    const { size } = await descriptor.stat();
    const inicio = Buffer.alloc(4);
    await descriptor.read(inicio, 0, 4, 0);
    if (size < 22 || inicio.readUInt32LE(0) !== 0x04034b50) {
      throw new LibroInvalido("El archivo no es un libro de Excel (.xlsx).");
    }
    const largo = Math.min(size, 65_557);
    const cola = Buffer.alloc(largo);
    await descriptor.read(cola, 0, largo, size - largo);
    if (cola.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) === -1) {
      throw new LibroInvalido(
        "El archivo está incompleto o dañado. Vuelve a guardarlo desde Excel e inténtalo de nuevo.",
      );
    }
  } finally {
    await descriptor.close();
  }
};

export const valor = ({ celdas, columnas }, nombre) => {
  const indice = columnas.indexOf(nombre);
  return indice === -1 ? null : celdas[indice + 1];
};
