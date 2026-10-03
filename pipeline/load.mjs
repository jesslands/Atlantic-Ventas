import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

import { truncar } from "./transform.mjs";

const LOTE = 2000;

export const inicializarEsquema = async (cliente, raizProyecto) => {
  await cliente.connect();
  await cliente.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows: aplicadas } = await cliente.query(`SELECT id FROM schema_migrations`);
  const yaAplicadas = new Set(aplicadas.map((fila) => fila.id));
  const dir = join(raizProyecto, "db", "migrations");
  const { readdir } = await import("node:fs/promises");
  const archivos = (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort();
  for (const archivo of archivos) {
    const id = archivo.replace(/\.sql$/, "");
    if (yaAplicadas.has(id)) continue;
    await cliente.query(await readFile(join(dir, archivo), "utf8"));
    await cliente.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [id]);
  }
};

const insetar = async (client, tabla, columnas, filas, conflicto) => {
  for (let inicio = 0; inicio < filas.length; inicio += LOTE) {
    const lote = filas.slice(inicio, inicio + LOTE);
    const valores = [];
    const tuplas = lote
      .map((fila) => {
        const filaSegura = truncar(tabla, columnas, fila);
        const marcadores = filaSegura.map((dato) => {
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

export const cargarMaestras = async (cliente, tablas) => {
  const conflictos = {
    asesores:
      "ON CONFLICT (cod_asesor) DO UPDATE SET nombre = EXCLUDED.nombre, sede = EXCLUDED.sede",
    clientes:
      "ON CONFLICT (cod_cliente) DO UPDATE SET nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo",
    materiales: `ON CONFLICT (cod_material) DO UPDATE SET nombre = EXCLUDED.nombre, categoria = EXCLUDED.categoria,
       subcategoria = EXCLUDED.subcategoria, producto_base = EXCLUDED.producto_base,
       presentacion = EXCLUDED.presentacion, formato = EXCLUDED.formato,
       calidad = EXCLUDED.calidad, marca = EXCLUDED.marca`,
    cliente_asesor:
      "ON CONFLICT (cod_cliente) DO UPDATE SET cod_asesor = EXCLUDED.cod_asesor",
  };
  const columnas = {
    asesores: ["cod_asesor", "nombre", "sede"],
    clientes: ["cod_cliente", "nombre", "tipo"],
    materiales: [
      "cod_material", "nombre", "categoria", "subcategoria", "producto_base",
      "presentacion", "formato", "calidad", "marca",
    ],
    cliente_asesor: ["cod_cliente", "cod_asesor"],
  };
  const orden = ["asesores", "clientes", "materiales", "cliente_asesor"];
  for (const tabla of orden) {
    const filas = tablas[tabla];
    if (!filas?.length) continue;
    await insetar(cliente, tabla, columnas[tabla], filas, conflictos[tabla]);
  }
};

export const cargarVentas = (cliente, lote) =>
  insetar(
    cliente,
    "ventas",
    ["periodo", "cod_cliente", "cod_material", "neto"],
    lote,
    "ON CONFLICT (periodo, cod_cliente, cod_material) DO UPDATE SET neto = EXCLUDED.neto",
  );

export const crearCliente = (connectionString) =>
  new pg.Client({ connectionString: connectionString ?? "postgres://localhost/ignorar" });