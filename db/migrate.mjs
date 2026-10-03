#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RAIZ = resolve(fileURLToPath(import.meta.url), "..", "..");
const DIR = resolve(RAIZ, "db", "migrations");
const TABLA_CONTROL = "schema_migrations";

const cliente = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? "postgres://localhost/ignorar",
});

await cliente.connect();

await cliente.query(`
  CREATE TABLE IF NOT EXISTS ${TABLA_CONTROL} (
    id          text PRIMARY KEY,
    aplicada_en timestamptz NOT NULL DEFAULT now()
  )
`);

const archivos = (await readdir(DIR))
  .filter((nombre) => nombre.endsWith(".sql"))
  .sort();

const { rows: aplicadas } = await cliente.query(
  `SELECT id FROM ${TABLA_CONTROL}`,
);
const yaAplicadas = new Set(aplicadas.map((fila) => fila.id));

let nuevas = 0;
for (const archivo of archivos) {
  const id = archivo.replace(/\.sql$/, "");
  if (yaAplicadas.has(id)) continue;
  const sql = await readFile(join(DIR, archivo), "utf8");
  process.stdout.write(`  aplicando ${id} ... `);
  try {
    await cliente.query(sql);
    await cliente.query(`INSERT INTO ${TABLA_CONTROL} (id) VALUES ($1)`, [id]);
    process.stdout.write("ok\n");
    nuevas += 1;
  } catch (error) {
    process.stdout.write("FALLO\n");
    console.error(`    ${error.message}`);
    await cliente.end();
    process.exit(1);
  }
}

await cliente.end();
console.log(`Migraciones: ${nuevas} nuevas, ${archivos.length - nuevas} sin cambios.`);