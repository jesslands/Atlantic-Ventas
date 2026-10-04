import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ApiError, noEncontrado, peticionInvalida } from "./http";

/**
 * Subida por partes del libro de Excel. Un archivo grande no cabe en una sola
 * peticion: Node corta a los 5 minutos cualquier peticion que no termino de
 * llegar (requestTimeout) y proxy.ts guarda en memoria el cuerpo de cada
 * peticion que pasa por el. Por partes, cada peticion es corta y acotada, y una
 * parte que falla se reintenta sola sin volver a empezar.
 */

export const TAMANO_MAXIMO = 1.5 * 1024 ** 3;
// Debe quedar por debajo de experimental.proxyClientMaxBodySize (next.config.ts).
export const TAMANO_PARTE = 32 * 1024 ** 2;
// Una subida sin actividad durante este tiempo se considera abandonada.
const VENCE_MS = 60 * 60 * 1000;

const DIRECTORIO = join(tmpdir(), "atlantic-subidas");
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Meta = { tamano: number };

const rutas = (id: string) => {
  if (!ID.test(id)) throw noEncontrado("La subida no existe o ya venció.");
  return { datos: join(DIRECTORIO, `${id}.xlsx`), meta: join(DIRECTORIO, `${id}.json`) };
};

const leerMeta = async (id: string) => {
  const { meta } = rutas(id);
  const texto = await readFile(meta, "utf8").catch(() => null);
  if (!texto) throw noEncontrado("La subida no existe o ya venció.");
  return JSON.parse(texto) as Meta;
};

const recibido = async (archivo: string) => (await stat(archivo).catch(() => null))?.size ?? 0;

/** Borra las subidas abandonadas para no llenar el disco con archivos a medias. */
const limpiarVencidas = async () => {
  const archivos = await readdir(DIRECTORIO).catch(() => [] as string[]);
  const ahora = Date.now();
  await Promise.all(
    archivos.map(async (nombre) => {
      const ruta = join(DIRECTORIO, nombre);
      const info = await stat(ruta).catch(() => null);
      if (info && ahora - info.mtimeMs > VENCE_MS) await rm(ruta, { force: true });
    }),
  );
};

export const crearSubida = async (tamano: unknown) => {
  if (typeof tamano !== "number" || !Number.isInteger(tamano) || tamano <= 0) {
    throw peticionInvalida("Indica el tamaño del archivo en bytes.");
  }
  if (tamano > TAMANO_MAXIMO) {
    throw new ApiError(413, "ARCHIVO_DEMASIADO_GRANDE", "El archivo supera 1,5 GB.");
  }
  await mkdir(DIRECTORIO, { recursive: true });
  await limpiarVencidas();
  const id = randomUUID();
  const { datos, meta } = rutas(id);
  await writeFile(datos, "");
  await writeFile(meta, JSON.stringify({ tamano } satisfies Meta));
  return { id, tamano, tamano_parte: TAMANO_PARTE };
};

/**
 * Agrega una parte al final. `desde` debe ser exactamente lo ya recibido: si no
 * coincide (p. ej. un reintento de una parte que si llego) responde 409 con lo
 * recibido, para que el cliente siga desde ahi sin duplicar bytes.
 */
export const agregarParte = async (id: string, desde: number, request: Request) => {
  const { tamano } = await leerMeta(id);
  const { datos } = rutas(id);
  const actual = await recibido(datos);
  if (desde !== actual) {
    throw new ApiError(409, "DESFASE", "La parte no continúa donde quedó la subida.", { recibido: actual });
  }
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > TAMANO_PARTE || actual + declarado > tamano) {
    throw new ApiError(413, "PARTE_DEMASIADO_GRANDE", "La parte excede el tamaño permitido.");
  }
  if (!request.body) throw peticionInvalida("La parte llegó vacía.");

  // Se escribe primero en memoria (una parte es pequena) y solo se anexa si
  // llego completa: asi una parte cortada no deja bytes sueltos en el archivo.
  const trozos: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > TAMANO_PARTE || actual + total > tamano) {
      throw new ApiError(413, "PARTE_DEMASIADO_GRANDE", "La parte excede el tamaño permitido.");
    }
    trozos.push(chunk);
  }
  if (total === 0 || (declarado && total !== declarado)) {
    throw peticionInvalida("La parte llegó incompleta. Se reintentará.");
  }
  const archivo = await open(datos, "a");
  try {
    for (const trozo of trozos) await archivo.write(trozo);
  } finally {
    await archivo.close();
  }
  return { recibido: actual + total, tamano };
};

/** Ruta del archivo ya completo, lista para el pipeline. */
export const archivoCompleto = async (id: string) => {
  const { tamano } = await leerMeta(id);
  const { datos } = rutas(id);
  const actual = await recibido(datos);
  if (actual !== tamano) {
    throw new ApiError(409, "SUBIDA_INCOMPLETA", "El archivo todavía no terminó de subir.", {
      recibido: actual,
      tamano,
    });
  }
  return datos;
};

export const borrarSubida = async (id: string) => {
  const { datos, meta } = rutas(id);
  await Promise.all([rm(datos, { force: true }), rm(meta, { force: true })]);
};
