/**
 * Pruebas de integracion del API contra el servidor real (next start) y Postgres.
 * Sin framework extra: el runner de node:test y la base sembrada con datos
 * deterministas en el periodo 2090, que no existe en el dataset (2026).
 *
 *   pnpm build && pnpm test
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import pg from "pg";

const PUERTO = Number(process.env.TEST_PORT ?? 4310);
const BASE = `http://127.0.0.1:${PUERTO}`;
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://atlantic:atlantic@localhost:5432/atlantic";

const CLIENTE_A = 9_000_001;
const CLIENTE_B = 9_000_002;
const MATERIAL_1 = 9_900_001;
const MATERIAL_2 = 9_900_002;
const RANGO = "desde=2090-01&hasta=2090-02";

const db = new pg.Client({ connectionString: DATABASE_URL });
const sql = (texto, valores = []) => db.query(texto, valores);

async function sembrar() {
  await sql(
    `INSERT INTO asesores (cod_asesor, nombre, sede) VALUES ('ASE-901', 'Asesor Prueba', 'PRUEBA')
     ON CONFLICT (cod_asesor) DO UPDATE SET nombre = EXCLUDED.nombre, sede = EXCLUDED.sede`,
  );
  await sql(
    `INSERT INTO clientes (cod_cliente, nombre, tipo)
     VALUES ($1, 'Cliente Alfa', 'Hotel'), ($2, 'Cliente Beta', 'Restaurante')
     ON CONFLICT (cod_cliente) DO UPDATE SET nombre = EXCLUDED.nombre`,
    [CLIENTE_A, CLIENTE_B],
  );
  await sql(
    `INSERT INTO materiales (cod_material, nombre) VALUES ($1, 'Material Uno'), ($2, 'Material Dos')
     ON CONFLICT (cod_material) DO UPDATE SET nombre = EXCLUDED.nombre`,
    [MATERIAL_1, MATERIAL_2],
  );
  await sql(
    `INSERT INTO cliente_asesor (cod_cliente, cod_asesor) VALUES ($1, 'ASE-901'), ($2, 'ASE-901')
     ON CONFLICT (cod_cliente) DO UPDATE SET cod_asesor = EXCLUDED.cod_asesor`,
    [CLIENTE_A, CLIENTE_B],
  );
  // Reingerir el mismo grano dos veces no debe crear filas extra (upsert).
  for (const intento of [1, 2]) {
    await sql(
      `INSERT INTO ventas (periodo, cod_cliente, cod_material, neto) VALUES
         ('2090-01-01', $1, $3, 1000),
         ('2090-02-01', $1, $3, 1500),
         ('2090-02-01', $2, $4, -300)
       ON CONFLICT (periodo, cod_cliente, cod_material) DO UPDATE SET neto = EXCLUDED.neto`,
      [CLIENTE_A, CLIENTE_B, MATERIAL_1, MATERIAL_2],
    );
    const { rows } = await sql(
      "SELECT count(*)::int AS total FROM ventas WHERE periodo BETWEEN '2090-01-01' AND '2090-12-31'",
    );
    assert.equal(rows[0].total, 3, `intento ${intento}: el grano no se duplica`);
  }
}

async function limpiar() {
  await sql("DELETE FROM ventas WHERE periodo BETWEEN '2090-01-01' AND '2090-12-31'");
  await sql("DELETE FROM cliente_asesor WHERE cod_cliente IN ($1, $2)", [CLIENTE_A, CLIENTE_B]);
  await sql("DELETE FROM clientes WHERE cod_cliente IN ($1, $2)", [CLIENTE_A, CLIENTE_B]);
  await sql("DELETE FROM materiales WHERE cod_material IN ($1, $2)", [MATERIAL_1, MATERIAL_2]);
  await sql("DELETE FROM asesores WHERE cod_asesor = 'ASE-901'");
}

let servidor;

const esperarServidor = async () => {
  for (let intento = 0; intento < 90; intento += 1) {
    try {
      const respuesta = await fetch(`${BASE}/api/kpis?${RANGO}`);
      if (respuesta.ok) return;
    } catch {
      // todavia no levanta
    }
    await new Promise((resolver) => setTimeout(resolver, 1000));
  }
  throw new Error(`El API no levanto en ${BASE}. Ejecuta "pnpm build" antes de "pnpm test".`);
};

before(async () => {
  await db.connect();
  await sembrar();
  // detached: next arranca un hijo next-server; sin grupo de procesos queda huerfano.
  servidor = spawn("node_modules/.bin/next", ["start", "--port", String(PUERTO)], {
    env: { ...process.env, DATABASE_URL, PORT: String(PUERTO), NODE_ENV: "production" },
    stdio: "ignore",
    detached: true,
  });
  await esperarServidor();
  await fetch(`${BASE}/api/kpis?${RANGO}`); // calentar conexiones y pool
});

after(async () => {
  try {
    process.kill(-servidor.pid);
  } catch {
    servidor.kill();
  }
  await limpiar();
  await db.end();
});

const pedir = async (ruta) => {
  const inicio = performance.now();
  const respuesta = await fetch(`${BASE}${ruta}`);
  return { respuesta, cuerpo: await respuesta.json(), ms: performance.now() - inicio };
};

test("ventas.periodo es un DATE real, no texto", async () => {
  const { rows } = await sql(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'ventas' AND column_name = 'periodo'`,
  );
  assert.equal(rows[0].data_type, "date", "el periodo se guarda como DATE, no como texto");

  // El grano es mensual: Postgres debe rechazar un dia que no sea el primero del mes.
  await assert.rejects(
    sql(`INSERT INTO ventas (periodo, cod_cliente, cod_material, neto)
         VALUES ('2090-02-15', $1, $2, 1)`, [CLIENTE_A, MATERIAL_1]),
    /ventas_periodo_check/,
    "un periodo a mitad de mes se rechaza",
  );
});

test("la API expone el periodo como YYYY-MM sin correr de dia por zona horaria", async () => {
  const { rows } = await sql(
    "SELECT periodo::text AS iso FROM ventas WHERE periodo = '2090-01-01' LIMIT 1",
  );
  assert.equal(rows[0].iso, "2090-01-01");

  const { cuerpo } = await pedir(`/api/ventas/tendencia?${RANGO}`);
  assert.equal(cuerpo.serie[0].periodo, "2090-01", "texto YYYY-MM, sin -03:00 ni corrimiento");
});

test("GET /kpis devuelve los indicadores del periodo y la variacion contra el mes anterior", async () => {
  const { respuesta, cuerpo } = await pedir(`/api/kpis?${RANGO}`);

  assert.equal(respuesta.status, 200);
  assert.equal(cuerpo.kpis.venta_neta, 2200, "1000 + 1500 - 300");
  assert.equal(cuerpo.kpis.venta_bruta, 2500);
  assert.equal(cuerpo.kpis.transacciones, 3);
  assert.equal(cuerpo.kpis.clientes_activos, 1, "el cliente B solo devuelve, no cuenta como activo");
  assert.equal(cuerpo.kpis.notas_credito, 1);
  assert.equal(cuerpo.kpis.monto_notas, -300);
  assert.equal(Number(cuerpo.kpis.pct_devoluciones.toFixed(4)), 12, "300 / 2500");
  assert.ok(Math.abs(cuerpo.kpis.ticket_promedio - 2200 / 3) < 1e-6);
  assert.deepEqual(cuerpo.kpis.variacion_vs_mes_anterior, {
    mes: "2090-02",
    mes_anterior: "2090-01",
    pct: 20,
  });
  assert.deepEqual(
    { desde: cuerpo.filtros.desde, hasta: cuerpo.filtros.hasta },
    { desde: "2090-01", hasta: "2090-02" },
  );
});

test("GET /kpis filtra por sede sin arrastrar el resto", async () => {
  const { cuerpo: conFiltro } = await pedir(`/api/kpis?sede=PRUEBA&${RANGO}`);
  assert.equal(conFiltro.kpis.venta_neta, 2200);

  const { cuerpo: otraSede } = await pedir(`/api/kpis?sede=BOGOTA&${RANGO}`);
  assert.equal(otraSede.kpis.transacciones, 0);
  assert.equal(otraSede.kpis.variacion_vs_mes_anterior, null, "sin serie no hay variacion");
});

test("GET /kpis filtra por asesor", async () => {
  const { cuerpo } = await pedir(`/api/kpis?asesor=ASE-901&${RANGO}`);
  assert.equal(cuerpo.kpis.transacciones, 3);
  const { cuerpo: otro } = await pedir(`/api/kpis?asesor=ASE-001&${RANGO}`);
  assert.equal(otro.kpis.transacciones, 0);
});

test("GET /kpis responde 400 con detalle cuando el periodo no existe", async () => {
  const { respuesta, cuerpo } = await pedir("/api/kpis?desde=2026-13");
  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.error.codigo, "PARAMETROS_INVALIDOS");
  assert.deepEqual(cuerpo.error.detalles, { desde: "2026-13" });
});

test("GET /kpis responde 400 si desde es posterior a hasta", async () => {
  const { respuesta, cuerpo } = await pedir("/api/kpis?desde=2026-05&hasta=2026-01");
  assert.equal(respuesta.status, 400);
  assert.match(cuerpo.error.mensaje, /posterior/);
});

test("GET /kpis no es inyectable por query string", async () => {
  const { respuesta, cuerpo } = await pedir(
    `/api/kpis?desde=2090-01&sede=x%27%3B%20DROP%20TABLE%20ventas%3B--`,
  );
  assert.equal(respuesta.status, 400, "la sede se rechaza por formato");
  await sql("SELECT 1 FROM ventas LIMIT 1");
  assert.ok(cuerpo.error.codigo);
});

test("GET /kpis responde en menos de 1 segundo sobre el dataset completo", async () => {
  const { ms, respuesta } = await pedir("/api/kpis");
  assert.equal(respuesta.status, 200);
  assert.ok(ms < 1000, `tardo ${ms.toFixed(0)} ms`);
});

test("GET /ventas/tendencia devuelve la serie real y proyecta hasta diciembre", async () => {
  const { respuesta, cuerpo, ms } = await pedir(`/api/ventas/tendencia?${RANGO}`);
  assert.equal(respuesta.status, 200);
  const serie = cuerpo.serie;

  assert.deepEqual(
    serie.slice(0, 2).map((punto) => [punto.periodo, punto.real]),
    [
      ["2090-01", 1000],
      ["2090-02", 1200],
    ],
    "febrero suma la nota credito",
  );
  assert.equal(serie.length, 12, "de 2090-01 a 2090-12");
  assert.equal(serie.at(-1).periodo, "2090-12");
  assert.equal(serie.at(-1).real, null, "un mes futuro no es real");
  assert.ok(serie.every((punto) => punto.real !== null || punto.proyeccion !== null));
  assert.equal(serie[1].proyeccion, 1200, "el ultimo real ancla la proyeccion");
  assert.ok(ms < 1000, `tardo ${ms.toFixed(0)} ms`);
});

test("GET /ventas/tendencia con un solo mes no proyecta", async () => {
  const { cuerpo } = await pedir("/api/ventas/tendencia?desde=2090-01&hasta=2090-01");
  assert.deepEqual(cuerpo.serie, [{ periodo: "2090-01", real: 1000, proyeccion: null }]);
});

test("GET /ventas/tendencia sobre el dataset real cubre los 6 periodos y proyecta a diciembre", async () => {
  const { cuerpo } = await pedir("/api/ventas/tendencia?desde=2026-01&hasta=2026-06");
  assert.equal(cuerpo.serie.length, 12, "6 reales + proyeccion hasta 2026-12");
  assert.deepEqual(
    cuerpo.serie.slice(0, 6).map((punto) => punto.periodo),
    ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
  );
  assert.ok(cuerpo.serie[0].real > 0, "todo mes real trae venta");
});

test("GET /ventas/sedes reparte el 100% y filtra por asesor", async () => {
  const { cuerpo } = await pedir("/api/ventas/sedes?desde=2026-01&hasta=2026-06");
  // 7 sedes con venta: Cota (ASE-022) no tiene clientes asignados (ver DATA_QUALITY.md).
  assert.equal(cuerpo.sedes.length, 7);
  const total = cuerpo.sedes.reduce((suma, sede) => suma + sede.participacion, 0);
  assert.ok(Math.abs(total - 100) < 0.01, `participaciones suman ${total}`);

  const { cuerpo: unaSede } = await pedir("/api/ventas/sedes?asesor=ASE-001&desde=2026-01&hasta=2026-06");
  assert.equal(unaSede.sedes.length, 1);
  assert.equal(unaSede.sedes[0].sede, "BOGOTA");
});

test("GET /asesores/ranking ordena por venta y calcula la variacion", async () => {
  const { cuerpo } = await pedir("/api/asesores/ranking?desde=2026-01&hasta=2026-06&limite=5");
  assert.equal(cuerpo.ranking.length, 5);
  const netos = cuerpo.ranking.map((asesor) => asesor.neto);
  assert.deepEqual(netos, [...netos].sort((a, b) => b - a), "ordenado de mayor a menor");
  assert.ok(cuerpo.ranking[0].clientes > 0);
  assert.equal(typeof cuerpo.ranking[0].variacionPct, "number");
});

test("GET /clientes pagina, busca y ordena", async () => {
  const { cuerpo } = await pedir("/api/clientes?porPagina=5&pagina=1&orden=nombre&dir=asc");
  assert.equal(cuerpo.clientes.length, 5);
  assert.ok(cuerpo.paginacion.total > 1000);
  const nombres = cuerpo.clientes.map((cliente) => cliente.nombre);
  assert.deepEqual(nombres, [...nombres].sort((a, b) => a.localeCompare(b, "es")));

  const { cuerpo: filtrado } = await pedir("/api/clientes?q=Alameda&porPagina=50");
  assert.ok(filtrado.clientes.length > 0);
  assert.ok(
    filtrado.clientes.every((cliente) => cliente.nombre.toLowerCase().includes("alameda")),
    "la busqueda es parcial",
  );
});

test("GET /clientes responde 400 con un orden desconocido", async () => {
  const { respuesta, cuerpo } = await pedir("/api/clientes?orden=neto;DROP+TABLE+ventas");
  assert.equal(respuesta.status, 400);
  assert.match(cuerpo.error.mensaje, /orden/);
});

test("GET /clientes/[codigo] devuelve la ficha con historial y responde 404 si no existe", async () => {
  const { respuesta, cuerpo } = await pedir(`/api/clientes/${CLIENTE_A}`);
  assert.equal(respuesta.status, 200);
  assert.equal(cuerpo.cliente.codigo, CLIENTE_A);
  assert.equal(cuerpo.neto, 2500);
  assert.equal(cuerpo.ventas, 2);
  assert.equal(cuerpo.primera_compra, "2090-01");
  assert.equal(cuerpo.ultima_compra, "2090-02");
  assert.equal(cuerpo.materiales.length, 1);

  const { respuesta: ausente } = await pedir("/api/clientes/999999999");
  assert.equal(ausente.status, 404);
});

test("el API responde con cabeceras de seguridad (helmet) y límite de peticiones", async () => {
  const respuesta = await fetch(`${BASE}/api/kpis?${RANGO}`);
  assert.equal(respuesta.headers.get("x-content-type-options"), "nosniff");
  assert.ok(respuesta.headers.get("x-frame-options"));
  assert.ok(Number(respuesta.headers.get("x-ratelimit-limit")) > 0);
  assert.ok(respuesta.headers.get("strict-transport-security"), "helmet aplica HSTS");
  assert.ok(respuesta.headers.get("referrer-policy"), "helmet aplica Referrer-Policy");
  assert.equal(respuesta.headers.get("x-powered-by"), null, "no se filtra X-Powered-By");
});

test("el rate limit responde 429 + Retry-After al superar el límite", async () => {
  const ipSintetica = "203.0.113.7";
  const cabecera = { "X-Forwarded-For": ipSintetica };
  const info = await fetch(`${BASE}/api/kpis?${RANGO}`, { headers: cabecera });
  const limite = Number(info.headers.get("x-ratelimit-limit"));
  assert.ok(limite > 0, "el endpoint debe anunciar el límite");

  for (let i = 1; i < limite; i += 1) {
    const r = await fetch(`${BASE}/api/kpis?${RANGO}`, { headers: cabecera });
    assert.notEqual(r.status, 429, `petición ${i} no debe estar bloqueada`);
  }

  const bloqueada = await fetch(`${BASE}/api/kpis?${RANGO}`, { headers: cabecera });
  assert.equal(bloqueada.status, 429);
  assert.equal(bloqueada.headers.get("retry-after"), "60");
  const cuerpo = await bloqueada.json();
  assert.equal(cuerpo.error.codigo, "DEMASIADAS_SOLICITUDES");
});

test("GET /api/docs/openapi.json documenta los seis endpoints", async () => {
  const { respuesta, cuerpo } = await pedir("/api/docs/openapi.json");
  assert.equal(respuesta.status, 200);
  assert.deepEqual(Object.keys(cuerpo.paths).sort(), [
    "/asesores/ranking",
    "/clientes",
    "/clientes/{codigo}",
    "/kpis",
    "/ventas/sedes",
    "/ventas/tendencia",
  ]);
  assert.equal(cuerpo.openapi, "3.1.0");
});
