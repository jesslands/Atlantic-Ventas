import { stat } from "node:fs/promises";

import { hoja, valor } from "./extract.mjs";
import { entero, neto, normalizarPeriodo, texto } from "./transform.mjs";
import {
  cargarMaestras,
  cargarVentas,
  crearCliente,
  inicializarEsquema,
} from "./load.mjs";

const HOJA_VENTAS = "Ventas";
const LOTE_VENTAS = 2000;

// Cada etapa ocupa un tramo de 0-100 en el avance total. Cargar las ventas en
// Postgres domina el tiempo, por eso se lleva la mayor parte del recorrido.
export const ETAPAS = {
  preparando: [0, 2],
  maestras: [2, 20],
  guardando_maestras: [20, 25],
  ventas: [25, 97],
  verificando: [97, 100],
};
// Dentro de "ventas": primero se vuelve a leer el zip (bytes) y luego se
// procesan las filas; esta es la parte del tramo que toma esa lectura.
const LECTURA_VENTAS = 0.2;

export class CargaCancelada extends Error {
  constructor() {
    super("La carga se canceló. No se guardó ningún cambio en la base.");
    this.name = "CargaCancelada";
  }
}

const crearReporte = (archivo) => ({
  archivo,
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
  maestras: { clientes: 0, materiales: 0, asesores: 0, asignaciones: 0 },
  leidas: 0,
  /** @type {Record<string, number>} */
  cargado: {},
});

/**
 * Lee el libro, depura y (si hay databaseUrl) lo carga en Postgres dentro de
 * una sola transaccion: si algo falla o `signal` se aborta, se hace ROLLBACK y
 * la base queda como estaba.
 *
 * progreso({ etapa, pct, detalle }) recibe el avance total en 0-100.
 *
 * @param {{
 *   archivo: string,
 *   raiz: string,
 *   databaseUrl?: string | null,
 *   signal?: AbortSignal,
 *   progreso?: (avance: { etapa: keyof typeof ETAPAS, pct: number, detalle: string }) => void,
 * }} opciones
 */
export const ejecutarPipeline = async ({
  archivo,
  raiz,
  databaseUrl,
  signal,
  progreso = () => {},
}) => {
  const reporte = crearReporte(archivo);
  const revisar = () => {
    if (signal?.aborted) throw new CargaCancelada();
  };
  let maximo = 0;
  /** @param {keyof typeof ETAPAS} etapa @param {number} fraccion @param {string} detalle */
  const avisar = (etapa, fraccion, detalle) => {
    const [desde, hasta] = ETAPAS[etapa];
    const acotada = Math.min(1, Math.max(0, fraccion));
    // Lectura de bytes y conteo de filas pueden llegar intercalados: la barra
    // nunca retrocede.
    maximo = Math.max(maximo, desde + (hasta - desde) * acotada);
    progreso({ etapa, pct: maximo, detalle });
  };

  avisar("preparando", 0, "Preparando la base");
  const { size: tamano } = await stat(archivo);
  const base = databaseUrl ? crearCliente(databaseUrl) : null;
  let enTransaccion = false;

  try {
    if (base) {
      await inicializarEsquema(base, raiz);
      revisar();
      await base.query("BEGIN");
      enTransaccion = true;
    }

    const clientes = new Map();
    const materiales = new Map();
    const asesores = new Map();
    const asignaciones = new Map();
    const pendientes = [];

    let totalVentas = null;
    avisar("maestras", 0, "Leyendo clientes, materiales y asesores");
    for await (const fila of hoja(archivo, null, {
      alLeer: (bytes) => avisar("maestras", bytes / tamano, "Leyendo clientes, materiales y asesores"),
      alContarVentas: (filas) => {
        totalVentas = filas;
      },
    })) {
      revisar();
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
    reporte.maestras = {
      clientes: clientes.size,
      materiales: materiales.size,
      asesores: asesores.size,
      asignaciones: asignaciones.size,
    };

    revisar();
    avisar("guardando_maestras", 0, `${clientes.size.toLocaleString("es-CO")} clientes, ${materiales.size.toLocaleString("es-CO")} materiales`);
    if (base) {
      await cargarMaestras(base, {
        asesores: [...asesores.values()],
        clientes: [...clientes.values()],
        materiales: [...materiales.values()],
        cliente_asesor: [...asignaciones.values()],
      });
    }
    avisar("guardando_maestras", 1, "Maestras guardadas");

    const conCompra = new Set();
    const lote = [];
    const notas = [];
    let leidas = 0;
    const detalleVentas = () =>
      totalVentas
        ? `${leidas.toLocaleString("es-CO")} de ${totalVentas.toLocaleString("es-CO")} ventas`
        : `${leidas.toLocaleString("es-CO")} ventas cargadas`;
    // Sin total declarado la barra se queda al final de la lectura y el
    // detalle sigue contando filas.
    const avanceVentas = () =>
      LECTURA_VENTAS + (1 - LECTURA_VENTAS) * (totalVentas ? leidas / totalVentas : 0);
    const volcar = async () => {
      revisar();
      if (base && lote.length) await cargarVentas(base, lote);
      lote.length = 0;
    };

    avisar("ventas", 0, "Leyendo la hoja de ventas");
    for await (const fila of hoja(archivo, HOJA_VENTAS, {
      alLeer: (bytes) => avisar("ventas", (bytes / tamano) * LECTURA_VENTAS, "Leyendo la hoja de ventas"),
    })) {
      revisar();
      leidas += 1;
      const original = texto(valor(fila, "PERIODO"));
      const periodo = normalizarPeriodo(original);
      if (!periodo) {
        reporte.limpio.periodos_invalidos += 1;
        continue;
      }
      if (original !== periodo) reporte.limpio.periodos_renormalizados += 1;
      reporte.periodos.set(periodo, (reporte.periodos.get(periodo) ?? 0) + 1);

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
      if (lote.length >= LOTE_VENTAS) {
        await volcar();
        avisar("ventas", avanceVentas(), detalleVentas());
      }
    }
    await volcar();
    reporte.leidas = leidas;

    reporte.limpio.notas_credito_sin_respaldo = notas.filter((codigo) => !conCompra.has(codigo)).length;
    reporte.limpio.clientes_que_solo_devuelven = new Set(
      notas.filter((codigo) => !conCompra.has(codigo)),
    ).size;

    avisar("verificando", 0, "Confirmando los cambios en la base");
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
      // Ultimo punto donde cancelar todavia deshace todo.
      revisar();
      await base.query("COMMIT");
      enTransaccion = false;
    }
    avisar("verificando", 1, "Carga completa");
    return reporte;
  } catch (error) {
    if (enTransaccion) await base.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (base) await base.end().catch(() => {});
  }
};
