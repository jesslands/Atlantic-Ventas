import { randomUUID } from "node:crypto";
import { open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ApiError, manejar, peticionInvalida } from "@/app/lib/api/http";
import { CargaCancelada, ejecutarPipeline } from "@/pipeline/ejecutar.mjs";
import { LibroInvalido } from "@/pipeline/extract.mjs";

export const dynamic = "force-dynamic";

// Debe coincidir con experimental.proxyClientMaxBodySize en next.config.ts:
// el proxy solo deja pasar hasta ese tamano.
const TAMANO_MAXIMO = 50 * 1024 * 1024;
const ZIP = [0x50, 0x4b, 0x03, 0x04];

// Una sola carga a la vez por instancia: dos transacciones escribiendo las
// mismas filas se bloquearian entre si y la segunda pisaria a la primera.
const estado = globalThis as unknown as { cargaEnCurso?: boolean };

const guardarCuerpo = async (request: Request, destino: string, declarado: number) => {
  if (!request.body) throw peticionInvalida("No se recibió ningún archivo.");
  const archivo = await open(destino, "w");
  let total = 0;
  try {
    for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > TAMANO_MAXIMO) {
        throw new ApiError(413, "ARCHIVO_DEMASIADO_GRANDE", "El archivo supera los 50 MB.");
      }
      await archivo.write(chunk);
    }
  } finally {
    await archivo.close();
  }
  if (total === 0) throw peticionInvalida("El archivo está vacío.");
  // Si algo en el camino corta el cuerpo (p. ej. el limite del proxy), llegan
  // menos bytes de los anunciados: mejor fallar aqui que procesar medio libro.
  if (declarado && total !== declarado) {
    throw peticionInvalida(
      `El archivo llegó incompleto (${total} de ${declarado} bytes). Inténtalo de nuevo.`,
    );
  }

  const cabecera = Buffer.alloc(4);
  const lectura = await open(destino, "r");
  await lectura.read(cabecera, 0, 4, 0).finally(() => lectura.close());
  if (!ZIP.every((byte, i) => cabecera[i] === byte)) {
    throw peticionInvalida("El contenido no corresponde a un libro de Excel (.xlsx).");
  }
};

/**
 * Recibe el .xlsx como cuerpo crudo y responde NDJSON: una linea por avance
 * ({ tipo: "progreso", etapa, pct, detalle }) y una final ("listo", "cancelado"
 * o "error"). Si el cliente corta la conexion, el pipeline se aborta y la
 * transaccion hace ROLLBACK.
 */
export const POST = manejar(async (request: Request) => {
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > TAMANO_MAXIMO) {
    throw new ApiError(413, "ARCHIVO_DEMASIADO_GRANDE", "El archivo supera los 50 MB.");
  }
  if (estado.cargaEnCurso) {
    throw new ApiError(409, "CARGA_EN_CURSO", "Ya hay una carga en curso. Espera a que termine o cancélala.");
  }
  estado.cargaEnCurso = true;

  const temporal = join(tmpdir(), `atlantic-carga-${randomUUID()}.xlsx`);
  const liberar = async () => {
    estado.cargaEnCurso = false;
    await rm(temporal, { force: true });
  };

  try {
    await guardarCuerpo(request, temporal, declarado);
  } catch (error) {
    await liberar();
    throw error;
  }

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
          archivo: temporal,
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
