import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hoja, valor } from "./extract.mjs";
import {
  entero,
  etiquetaPeriodo,
  neto,
  normalizarPeriodo,
  texto,
} from "./transform.mjs";
import {
  cargarMaestras,
  cargarVentas,
  crearCliente,
  inicializarEsquema,
} from "./load.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(
  process.argv.slice(2).map((argumento) => {
    const [clave, valor = "true"] = argumento.replace(/^--/, "").split("=");
    return [clave, valor];
  }),
);

const HOJA_VENTAS = "Ventas";

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

const volcarLote = async (cliente, lote) => {
  if (!cliente || !lote.length) return;
  await cargarVentas(cliente, lote);
  lote.length = 0;
};

const main = async () => {
  const archivo = resolve(RAIZ, reporte.archivo);
  console.log(`Pipeline: ${archivo}`);
  const cliente = crearCliente(process.env.DATABASE_URL);
  const base = !args.get("sin-db") && process.env.DATABASE_URL ? cliente : null;
  if (!args.get("sin-db") && !process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env o ejecuta con --sin-db.");
  }
  if (base) await inicializarEsquema(base, RAIZ);

  const clientes = new Map();
  const materiales = new Map();
  const asesores = new Map();
  const asignaciones = new Map();
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
    await cargarMaestras(base, {
      asesores: [...asesores.values()],
      clientes: [...clientes.values()],
      materiales: [...materiales.values()],
      cliente_asesor: [...asignaciones.values()],
    });
  }

  const conCompra = new Set();
  const lote = [];
  const notas = [];
  let leidas = 0;

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
    if (lote.length >= 2000) await volcarLote(base, lote);
  }
  await volcarLote(base, lote);

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
    console.log("  --sin-db: no se cargó Postgres.");
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