import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ejecutarPipeline } from "./ejecutar.mjs";
import { etiquetaPeriodo } from "./transform.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(
  process.argv.slice(2).map((argumento) => {
    const [clave, valor = "true"] = argumento.replace(/^--/, "").split("=");
    return [clave, valor];
  }),
);

const main = async () => {
  const archivo = resolve(RAIZ, args.get("archivo") ?? join(RAIZ, "investigacion", "Base.xlsx"));
  console.log(`Pipeline: ${archivo}`);
  const sinDb = Boolean(args.get("sin-db"));
  if (!sinDb && !process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env o ejecuta con --sin-db.");
  }

  let etapaActual = null;
  const reporte = await ejecutarPipeline({
    archivo,
    raiz: RAIZ,
    databaseUrl: sinDb ? null : process.env.DATABASE_URL,
    progreso: ({ etapa, detalle }) => {
      if (etapa === etapaActual) return;
      etapaActual = etapa;
      console.log(`  [${etapa}] ${detalle}`);
    },
  });

  const { maestras } = reporte;
  console.log(
    `  Maestras: ${maestras.clientes} clientes, ${maestras.materiales} materiales, ${maestras.asesores} asesores, ${maestras.asignaciones} asignaciones`,
  );
  console.log(`  Ventas leidas: ${reporte.leidas.toLocaleString("es-CO")}`);
  console.log(
    `  Periodos: ${[...reporte.periodos.keys()].sort().map((iso) => etiquetaPeriodo(iso)).join(" | ")}`,
  );
  if (sinDb) console.log("  --sin-db: no se cargó Postgres.");
  else console.log("  Total en base:", reporte.cargado);

  const destino = join(RAIZ, "pipeline", "reporte-limpieza.json");
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(
    destino,
    JSON.stringify(
      {
        archivo: reporte.archivo,
        periodos: [...reporte.periodos]
          .map(([iso, filas]) => ({ iso, etiqueta: etiquetaPeriodo(iso), filas }))
          .sort((a, b) => a.iso.localeCompare(b.iso)),
        limpio: reporte.limpio,
        cargado: reporte.cargado,
      },
      null,
      2,
    ),
  );
  console.log("  Limpieza:", reporte.limpio);
  console.log(`  Reporte: ${destino}`);
};

await main();
