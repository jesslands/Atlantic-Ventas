import assert from "node:assert/strict";
import { test } from "node:test";

import {
  leerFiltros,
  entero as leerEntero,
  comoFecha,
  moverPeriodo,
} from "../app/lib/api/filtros.ts";
import { variacion, proyectar } from "../app/lib/api/analitica.ts";

const filtros = (texto) => leerFiltros(new URLSearchParams(texto));

test("variacion: caso normal, anterior positivo", () => {
  assert.equal(variacion(120, 100), 20);
  assert.equal(variacion(50, 100), -50);
});

test("variacion: divisor cero no rompe (anterior = 0 -> 0)", () => {
  assert.equal(variacion(100, 0), 0);
  assert.equal(variacion(0, 0), 0);
});

test("variacion: cambio de signo respecto a un negativo usa Math.abs", () => {
  assert.equal(variacion(50, -100), ((50 - -100) / Math.abs(-100)) * 100);
});

const fila = (periodo, neto) => ({
  periodo,
  neto,
  ventas: 1,
  notas: 0,
  monto_notas: 0,
  clientes: 1,
  ticket_mediano: neto,
});

test("proyectar: con menos de dos periodos no extrapola", () => {
  assert.deepEqual(proyectar([]), []);
  assert.deepEqual(proyectar([fila("2026-03", 100)]), [{ periodo: "2026-03", real: 100, proyeccion: null }]);
});

test("proyectar: serie hasta el mismo mes ya no agrega puntos", () => {
  const serie = proyectar([fila("2026-11", 80), fila("2026-12", 100)]);
  assert.equal(serie[serie.length - 1].periodo, "2026-12");
  assert.equal(serie[serie.length - 1].real, 100);
  assert.equal(serie[serie.length - 1].proyeccion, 100);
});

test("proyectar: serie corta extiende hasta diciembre", () => {
  const serie = proyectar([
    fila("2026-01", 100),
    fila("2026-02", 110),
    fila("2026-03", 120),
  ]);
  assert.equal(serie[0].proyeccion, null);
  assert.equal(serie[2].proyeccion, 120, "último real ancla la proyección");
  assert.equal(serie.at(-1).periodo, "2026-12");
  assert.ok((serie[3].proyeccion ?? 0) > 120);
});

test("proyectar: con datos constantes la proyección los repite", () => {
  const serie = proyectar([fila("2026-06", 100), fila("2026-07", 100)]);
  for (let i = 1; i < serie.length; i += 1) {
    assert.equal(serie[i].proyeccion, 100);
  }
});

test("leerFiltros: parsea desde/hasta y separa listas por coma", () => {
  const f = filtros("desde=2026-01&hasta=2026-06&sede=BOGOTA,CALI&asesor=ASE-001,ASE-002");
  assert.equal(f.desde, "2026-01");
  assert.equal(f.hasta, "2026-06");
  assert.deepEqual(f.sedes, ["BOGOTA", "CALI"]);
  assert.deepEqual(f.asesores, ["ASE-001", "ASE-002"]);
});

test("leerFiltros: uppercase y dedup en la lista", () => {
  const f = filtros("sede=bogota,Bogota,BOGOTA");
  assert.deepEqual(f.sedes, ["BOGOTA"]);
});

test("leerFiltros: rechaza desde > hasta con peticionInvalida", () => {
  assert.throws(() => filtros("desde=2026-06&hasta=2026-01"), /posterior/);
});

test("leerFiltros: rechaza periodo malformado", () => {
  assert.throws(() => filtros("desde=2026-13"), /YYYY-MM/);
  assert.throws(() => filtros("desde=2026-00"), /YYYY-MM/);
  assert.throws(() => filtros("desde=foo-bar"), /YYYY-MM/);
});

test("leerFiltros: rechaza valor que no sea del catálogo", () => {
  assert.throws(() => filtros("sede=<script>"), /catálogo/);
  assert.throws(() => filtros("asesor=foo"), /catálogo/);
});

test("leerFiltros: sin parámetros devuelve filtrosVacios", () => {
  const f = filtros("");
  assert.equal(f.desde, undefined);
  assert.equal(f.hasta, undefined);
  assert.deepEqual(f.sedes, []);
  assert.deepEqual(f.asesores, []);
});

test("leerFiltros: único valor para sede; múltiples valores -> 400", () => {
  const f = filtros("sede=BOGOTA&sede=CALI");
  assert.deepEqual(f.sedes, ["BOGOTA", "CALI"]);
});

test("leerEntero: respeta el máximo y rechaza no numéricos", () => {
  const params = (v) => new URLSearchParams(`pagina=${v}`);
  assert.equal(leerEntero(params("5"), "pagina", 100), 5);
  assert.equal(leerEntero(params("0"), "pagina", 100), 0);
  assert.throws(() => leerEntero(params("101"), "pagina", 100), /entre 1 y 100/);
  assert.throws(() => leerEntero(params("abc"), "pagina", 100), /entre 1 y 100/);
});

test("comoFecha: añade el -01 canónico", () => {
  assert.equal(comoFecha("2026-03"), "2026-03-01");
});

test("moverPeriodo: avanza y retrocede meses en el mismo año", () => {
  assert.equal(moverPeriodo("2026-03", 1), "2026-04");
  assert.equal(moverPeriodo("2026-03", -1), "2026-02");
});

test("moverPeriodo: cruza fin de año en ambas direcciones", () => {
  assert.equal(moverPeriodo("2026-12", 1), "2027-01");
  assert.equal(moverPeriodo("2026-01", -1), "2025-12");
  assert.equal(moverPeriodo("2026-06", -12), "2025-06");
  assert.equal(moverPeriodo("2026-06", 12), "2027-06");
});