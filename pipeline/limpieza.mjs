/**
 * Pipeline de limpieza:investigacion/Base.xlsx (sucio) -> Postgres (limpio).
 *
 * Aplicacion de los hallazgos de investigacion/DATA_QUALITY.md:
 *   1. `Periodo` venia en 6 formatos -> se normaliza a YYYY-MM con regex.
 *   2. `Cod Principal` mezclaba int y texto con padding -> se pasa a entero.
 *   3. Maestras con duplicados literales -> se deduplican por llave.
 *   4. `Neto` negativos son notas credito -> se conservan y la base los marca
 *      (`es_nota_credito` es columna generada).
 *   5. Filas huerfanas -> se reportan y no entran a la base.
 *
 * La carga es un UPSERT por llave primaria: reingerir el mismo Excel actualiza
 * las filas existentes y solo agrega las nuevas, nunca duplica.
 *
 *   node --env-file-if-exists=.env pipeline/limpieza.mjs [--archivo=X] [--sin-db]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import pg from "pg";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(
  process.argv.slice(2).map((argumento) => {
    const [clave, valor = "true"] = argumento.replace(/^--/, "").split("=");
    return [clave, valor];
  }),
);

const LOTE = 2000;
const HOJA_VENTAS = "Ventas";

const PERIODO = /(\d{4})\D+?(\d{1,2})/;
const texto = (valor) => {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return String(valor.text ?? valor.result ?? "").trim();
  return String(valor).trim();
};
const entero = (valor) => {
  const limpio = texto(valor).replace(/\s/g, "");
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isInteger(numero) ? numero : null;
};
// El Excel trae "2026.01", "2026/05", "2026 06"… y Postgres solo castea ISO, asi que
// el periodo se normaliza al primer dia del mes: DATE real, ordenable y filtrable.
const ISO_PERIODO = /^(\d{4})-(\d{2})/;
const normalizarPeriodo = (valor) => {
  const found = PERIODO.exec(texto(valor));
  if (!found) return null;
  const [, anio, mes] = found;
  if (Number(mes) < 1 || Number(mes) > 12) return null;
  return `${anio}-${mes.padStart(2, "0")}-01`;
};
// Etiqueta legible DD/MMMM ("01/enero") para reportes y console, nunca para guardar.
const etiquetaPeriodo = (iso) => {
  const [, anio, mes] = ISO_PERIODO.exec(iso) ?? [];
  return mes
    // timeZone UTC: formatear la fecha en hora local se corre un dia (UTC-5 -> dia anterior).
    ? new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "long", timeZone: "UTC" })
        .format(new Date(Date.UTC(Number(anio), Number(mes) - 1, 1)))
        .replace(" de ", "/")
    : "";
};
const neto = (valor) => {
  if (typeof valor === "number") return valor;
  const limpio = texto(valor).replace(/\s/g, "");
  return limpio ? Number(limpio) : 0;
};

const reporte = {
  archivo: args.get("archivo") ?? join(RAIZ, "investigacion", "Base.xlsx"),
  periodos: new Map(),
  limpio: {
    periodos_renormalizados: 0,
    periodos_invalidos: 0,
    codigos_no_numericos: 0,
    duplicados_maestras: { clientes: 0, materiales: 0, asignaciones: 0, asesores: 0 },
    huerfanos: { cliente: 0, material: 0, asesor: 0 },
    notas_credito: 0,
    notas_credito_sin_respaldo: 0,
    clientes_que_solo_devuelven: 0,
    ceros: 0,
  },
  cargado: {},
};

const hoja = async function* (archivo, solo) {
  const lector = new ExcelJS.stream.xlsx.WorkbookReader(archivo, { worksheets: "emit" });
  for await (const worksheet of lector) {
    const wanted = solo ? solo === worksheet.name : worksheet.name !== HOJA_VENTAS;
    if (!wanted) continue;
    const columnas = [];
    for await (const fila of worksheet) {
      const celdas = fila.values;
      // La primera fila de cada hoja es el encabezado (en streaming no llega numerada).
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

const valor = ({ celdas, columnas }, nombre) => {
  const indice = columnas.indexOf(nombre);
  return indice === -1 ? null : celdas[indice + 1];
};

const insetar = async (client, tabla, columnas, filas, conflicto) => {
  for (let inicio = 0; inicio < filas.length; inicio += LOTE) {
    const lote = filas.slice(inicio, inicio + LOTE);
    const valores = [];
    const tuplas = lote
      .map((fila) => {
        const marcadores = fila.map((dato) => {
          valores.push(dato);
          return `$${valores.length}`;
        });
        return `(${marcadores.join(",")})`;
      })
      .join(",");
    await client.query(
      `INSERT INTO ${tabla} (${columnas.join(",")}) VALUES ${tuplas} ${conflicto}`,
      valores,
    );
  }
};

const main = async () => {
  const archivo = resolve(RAIZ, reporte.archivo);
  console.log(`Pipeline: ${archivo}`);
  const cliente = new pg.Client({
    connectionString: process.env.DATABASE_URL ?? "postgres://localhost/ignorar",
  });
  const base = !args.get("sin-db") && process.env.DATABASE_URL ? cliente : null;
  if (!args.get("sin-db") && !process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env o ejecuta con --sin-db.");
  }
  if (base) {
    await base.connect();
    await base.query(await readFile(join(RAIZ, "db", "schema.sql"), "utf8"));
  }

  // --- Pasada 1: maestras (hojas pequenas, ordenan las llaves foraneas) ---
  const clientes = new Map();
  const materiales = new Map();
  const asesores = new Map();
  const asignaciones = new Map();
  // La hoja "Asesores" puede leerse antes que "Sedes": se guarda cruda y se
  // resuelve al final, cuando ya estan las dos llaves foraneas.
  const pendientes = [];

  for await (const fila of hoja(archivo, null)) {
    switch (fila.hoja) {
      case "Clientes": {
        const codigo = entero(valor(fila, "COD CLIENTE"));
        if (codigo === null) continue;
        if (clientes.has(codigo)) {
          reporte.limpio.duplicados_maestras.clientes += 1;
          continue;
        }
        clientes.set(codigo, [
          codigo,
          texto(valor(fila, "NOMBRE CLIENTE")),
          texto(valor(fila, "TIPO CLIENTE")),
        ]);
        break;
      }
      case "Materiales": {
        const codigo = entero(valor(fila, "COD MATERIAL"));
        if (codigo === null) continue;
        if (materiales.has(codigo)) {
          reporte.limpio.duplicados_maestras.materiales += 1;
          continue;
        }
        materiales.set(codigo, [
          codigo,
          texto(valor(fila, "NOMBRE MATERIAL")),
          texto(valor(fila, "CATEGORIA")),
          texto(valor(fila, "SUBCATEGORIA")),
          texto(valor(fila, "PRODUCTO BASE")),
          texto(valor(fila, "PRESENTACION")),
          texto(valor(fila, "FORMATO")),
          texto(valor(fila, "CALIDAD")),
          texto(valor(fila, "MARCA")),
        ]);
        break;
      }
      case "Sedes": {
        const codigo = texto(valor(fila, "COD ASESOR")).toUpperCase();
        if (!codigo) continue;
        if (asesores.has(codigo)) {
          reporte.limpio.duplicados_maestras.asesores += 1;
          continue;
        }
        asesores.set(codigo, [codigo, texto(valor(fila, "NOMBRE ASESOR")), texto(valor(fila, "SEDE"))]);
        break;
      }
      case "Asesores": {
        const codigo = entero(valor(fila, "COD CLIENTE"));
        if (codigo === null) {
          reporte.limpio.codigos_no_numericos += 1;
          continue;
        }
        pendientes.push([codigo, texto(valor(fila, "COD ASESOR")).toUpperCase()]);
        break;
      }
    }
  }

  for (const [codigo, asesor] of pendientes) {
    if (!asesores.has(asesor)) {
      reporte.limpio.huerfanos.asesor += 1;
      continue;
    }
    if (!clientes.has(codigo)) {
      reporte.limpio.huerfanos.cliente += 1;
      continue;
    }
    if (asignaciones.has(codigo)) {
      reporte.limpio.duplicados_maestras.asignaciones += 1;
      continue;
    }
    asignaciones.set(codigo, [codigo, asesor]);
  }
  console.log(
    `  Maestras: ${clientes.size} clientes, ${materiales.size} materiales, ${asesores.size} asesores, ${asignaciones.size} asignaciones`,
  );

  if (base) {
    await insetar(
      base,
      "asesores",
      ["cod_asesor", "nombre", "sede"],
      [...asesores.values()],
      "ON CONFLICT (cod_asesor) DO UPDATE SET nombre = EXCLUDED.nombre, sede = EXCLUDED.sede",
    );
    await insetar(
      base,
      "clientes",
      ["cod_cliente", "nombre", "tipo"],
      [...clientes.values()],
      "ON CONFLICT (cod_cliente) DO UPDATE SET nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo",
    );
    await insetar(
      base,
      "materiales",
      ["cod_material", "nombre", "categoria", "subcategoria", "producto_base", "presentacion", "formato", "calidad", "marca"],
      [...materiales.values()],
      `ON CONFLICT (cod_material) DO UPDATE SET nombre = EXCLUDED.nombre, categoria = EXCLUDED.categoria,
       subcategoria = EXCLUDED.subcategoria, producto_base = EXCLUDED.producto_base,
       presentacion = EXCLUDED.presentacion, formato = EXCLUDED.formato,
       calidad = EXCLUDED.calidad, marca = EXCLUDED.marca`,
    );
    await insetar(
      base,
      "cliente_asesor",
      ["cod_cliente", "cod_asesor"],
      [...asignaciones.values()],
      "ON CONFLICT (cod_cliente) DO UPDATE SET cod_asesor = EXCLUDED.cod_asesor",
    );
  }

  // --- Pasada 2: ventas ---
  const conCompra = new Set();
  const lote = [];
  const notas = [];
  let leidas = 0;

  const volcar = async () => {
    if (!base || !lote.length) return;
    await insetar(
      base,
      "ventas",
      ["periodo", "cod_cliente", "cod_material", "neto"],
      lote,
      `ON CONFLICT (periodo, cod_cliente, cod_material) DO UPDATE SET neto = EXCLUDED.neto`,
    );
    lote.length = 0;
  };

  for await (const fila of hoja(archivo, HOJA_VENTAS)) {
    leidas += 1;
    const original = texto(valor(fila, "PERIODO"));
    const periodo = normalizarPeriodo(original);
    if (!periodo) {
      reporte.limpio.periodos_invalidos += 1;
      continue;
    }
    if (original !== periodo) reporte.limpio.periodos_renormalizados += 1;
    if (!reporte.periodos.has(periodo)) reporte.periodos.set(periodo, 0);
    reporte.periodos.set(periodo, reporte.periodos.get(periodo) + 1);

    const codCliente = entero(valor(fila, "COD PRINCIPAL"));
    const codMaterial = entero(valor(fila, "COD MATERIAL"));
    if (codCliente === null || codMaterial === null) {
      reporte.limpio.codigos_no_numericos += 1;
      continue;
    }
    if (!clientes.has(codCliente)) {
      reporte.limpio.huerfanos.cliente += 1;
      continue;
    }
    if (!materiales.has(codMaterial)) {
      reporte.limpio.huerfanos.material += 1;
      continue;
    }
    if (!asignaciones.has(codCliente)) {
      reporte.limpio.huerfanos.asesor += 1;
      continue;
    }

    const monto = Math.round(neto(valor(fila, "NETO")) * 100) / 100;
    if (monto < 0) {
      reporte.limpio.notas_credito += 1;
      notas.push(codCliente);
    } else if (monto === 0) {
      reporte.limpio.ceros += 1;
    } else {
      conCompra.add(codCliente);
    }

    lote.push([periodo, codCliente, codMaterial, monto]);
    if (lote.length >= LOTE) await volcar();
  }
  await volcar();

  // Cliente que solo devuelve: la nota no tiene ninguna compra que la respalde
  // (devolucion de una factura de 2025, fuera del dataset). Se reportan, no se borran.
  reporte.limpio.notas_credito_sin_respaldo = notas.filter((codigo) => !conCompra.has(codigo)).length;
  reporte.limpio.clientes_que_solo_devuelven = new Set(
    notas.filter((codigo) => !conCompra.has(codigo)),
  ).size;
  console.log(`  Ventas leidas: ${leidas.toLocaleString("es-CO")}`);
  console.log(
    `  Periodos: ${[...reporte.periodos.keys()].sort().map((iso) => etiquetaPeriodo(iso)).join(" | ")}`,
  );

  if (base) {
    const { rows } = await base.query(
      `SELECT (SELECT count(*) FROM ventas) AS ventas,
              (SELECT count(*) FROM clientes) AS clientes,
              (SELECT count(*) FROM materiales) AS materiales,
              (SELECT count(*) FROM cliente_asesor) AS asignaciones,
              (SELECT count(*) FROM asesores) AS asesores`,
    );
    for (const [tabla, total] of Object.entries(rows[0])) {
      reporte.cargado[tabla] = Number(total);
    }
    await base.end();
    console.log("  Total en base:", reporte.cargado);
  } else {
    console.log("  --sin-db: no se cargo Postgres.");
  }

  const destino = join(RAIZ, "pipeline", "reporte-limpieza.json");
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(
    destino,
    JSON.stringify(
      {
        ...reporte,
        periodos: [...reporte.periodos]
          .map(([iso, filas]) => ({ iso, etiqueta: etiquetaPeriodo(iso), filas }))
          .sort((a, b) => a.iso.localeCompare(b.iso)),
      },
      null,
      2,
    ),
  );
  console.log("  Limpieza:", reporte.limpio);
  console.log(`  Reporte: ${destino}`);
};

await main();
