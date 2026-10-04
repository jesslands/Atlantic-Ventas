import { pool } from "@/app/lib/api/db";
import { ApiError, manejar, peticionInvalida } from "@/app/lib/api/http";
import { archivoCompleto, borrarSubida } from "@/app/lib/api/subidas";
import { CargaCancelada, ejecutarPipeline } from "@/pipeline/ejecutar.mjs";
import { LibroInvalido } from "@/pipeline/extract.mjs";

export const dynamic = "force-dynamic";

// Una sola carga a la vez por instancia: dos transacciones escribiendo las
// mismas filas se bloquearian entre si y la segunda pisaria a la primera.
const estado = globalThis as unknown as { cargaEnCurso?: boolean };

/**
 * Procesa un libro ya subido por partes (POST /api/cargas/subidas) y responde
 * NDJSON: una linea por avance ({ tipo: "progreso", etapa, pct, detalle }) y
 * una final ("listo", "cancelado" o "error"). Si el cliente corta la conexion,
 * el pipeline se aborta y la transaccion hace ROLLBACK. Al terminar, de
 * cualquier forma, el archivo subido se borra.
 */
export const POST = manejar(async (request: Request) => {
  const cuerpoPeticion = await request.json().catch(() => null);
  const subida = cuerpoPeticion?.subida;
  if (typeof subida !== "string") throw peticionInvalida('Falta "subida": el id que devolvió /api/cargas/subidas.');
  const archivo = await archivoCompleto(subida);

  if (estado.cargaEnCurso) {
    throw new ApiError(409, "CARGA_EN_CURSO", "Ya hay una carga en curso. Espera a que termine o cancélala.");
  }
  estado.cargaEnCurso = true;
  const liberar = async () => {
    estado.cargaEnCurso = false;
    await borrarSubida(subida);
  };

  const cancelar = new AbortController();
  request.signal.addEventListener("abort", () => cancelar.abort(), { once: true });
  const codificar = new TextEncoder();

  const cuerpo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const enviar = (evento: object) => {
        if (cancelar.signal.aborted) return;
        controlador.enqueue(codificar.encode(`${JSON.stringify(evento)}\n`));
      };
      // El avance llega por cada chunk leido; basta con mandarlo cuando cambia
      // la etapa, el detalle o al menos medio punto porcentual.
      let ultimo = { etapa: "", pct: -1, detalle: "" };
      try {
        const reporte = await ejecutarPipeline({
          archivo,
          raiz: process.cwd(),
          databaseUrl: process.env.DATABASE_URL,
          signal: cancelar.signal,
          progreso: ({ etapa, pct, detalle }) => {
            const cambio =
              etapa !== ultimo.etapa || pct - ultimo.pct >= 0.5 || (detalle !== ultimo.detalle && pct - ultimo.pct >= 0.1);
            if (!cambio) return;
            ultimo = { etapa, pct, detalle };
            enviar({ tipo: "progreso", etapa, pct: Math.round(pct * 10) / 10, detalle });
          },
        });
        enviar({
          tipo: "listo",
          leidas: reporte.leidas,
          maestras: reporte.maestras,
          cargado: reporte.cargado,
          limpio: reporte.limpio,
        });
      } catch (error) {
        if (error instanceof CargaCancelada) {
          enviar({ tipo: "cancelado", mensaje: error.message });
        } else if (error instanceof LibroInvalido) {
          enviar({ tipo: "error", mensaje: error.message });
        } else {
          console.error("[api] carga de Excel fallida", error);
          enviar({
            tipo: "error",
            mensaje: "No se pudo procesar el archivo. Revisa que tenga las hojas y columnas esperadas; la base quedó sin cambios.",
          });
        }
      } finally {
        await liberar();
        try {
          controlador.close();
        } catch {
          // El cliente ya se fue: no hay a quien cerrarle el stream.
        }
      }
    },
    cancel() {
      cancelar.abort();
    },
  });

  return new Response(cuerpo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // no-transform evita que la compresion acumule el stream y el avance
      // llegue todo junto al final.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});

const CONTEO = `SELECT (SELECT count(*) FROM ventas)::int AS ventas,
                       (SELECT count(*) FROM clientes)::int AS clientes,
                       (SELECT count(*) FROM materiales)::int AS materiales,
                       (SELECT count(*) FROM asesores)::int AS asesores,
                       (SELECT count(*) FROM cliente_asesor)::int AS asignaciones`;

type Conteo = { ventas: number; clientes: number; materiales: number; asesores: number; asignaciones: number };

/** Filas que hay hoy en cada tabla: lo que se perderia al borrar. */
export const GET = manejar(async () => {
  const { rows } = await pool.query<Conteo>(CONTEO);
  return Response.json({ actual: rows[0] });
});

/**
 * Vacia las tablas de datos (ventas y maestras) en una transaccion. Conserva el
 * esquema y schema_migrations: despues basta con volver a cargar el Excel.
 * Comparte el candado con POST para no borrar en medio de una carga.
 */
export const DELETE = manejar(async () => {
  if (estado.cargaEnCurso) {
    throw new ApiError(409, "CARGA_EN_CURSO", "Hay una carga en curso. Espera a que termine o cancélala.");
  }
  estado.cargaEnCurso = true;
  const cliente = await pool.connect().catch((error) => {
    estado.cargaEnCurso = false;
    throw error;
  });
  try {
    await cliente.query("BEGIN");
    const { rows } = await cliente.query<Conteo>(CONTEO);
    await cliente.query("TRUNCATE ventas, cliente_asesor, clientes, materiales, asesores");
    await cliente.query("COMMIT");
    return Response.json({ borrado: rows[0] });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    cliente.release();
    estado.cargaEnCurso = false;
  }
});
