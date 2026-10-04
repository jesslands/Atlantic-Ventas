"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Circle,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  Trash2,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { ErrorApi } from "../lib/apiClient";
import { useModalUpload, usePegado } from "../lib/ui";

// Igual que TAMANO_MAXIMO en app/lib/api/subidas.ts.
const TAMANO_MAXIMO = 1.5 * 1024 ** 3;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  magic.every((byte, index) => bytes[index] === byte);

export async function validateXlsx(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return "El archivo debe tener extensión .xlsx.";
  }

  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());

  if (startsWith(bytes, OLE_MAGIC)) {
    return "El archivo es un libro antiguo de Excel (.xls). Conviértelo a .xlsx e inténtalo de nuevo.";
  }

  if (!startsWith(bytes, ZIP_MAGIC)) {
    return "El contenido del archivo no corresponde a un libro de Excel válido.";
  }

  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > TAMANO_MAXIMO) return "El archivo supera el máximo de 1,5 GB.";

  return null;
}

// Pasos que reporta POST /api/cargas (ver pipeline/ejecutar.mjs), mas la
// subida del archivo, que solo la ve el navegador.
const ETAPAS = [
  { id: "subiendo", nombre: "Subiendo archivo" },
  { id: "preparando", nombre: "Preparando la base" },
  { id: "maestras", nombre: "Leyendo clientes, materiales y asesores" },
  { id: "guardando_maestras", nombre: "Guardando maestras" },
  { id: "ventas", nombre: "Cargando ventas" },
  { id: "verificando", nombre: "Confirmando cambios" },
] as const;

type Etapa = (typeof ETAPAS)[number]["id"];

// La subida ocupa este tramo de la barra; el resto lo reporta el servidor.
const TRAMO_SUBIDA = 10;

type Resumen = {
  leidas: number;
  cargado: Record<string, number>;
};

type Carga =
  | { estado: "inactiva" }
  | { estado: "en_curso"; etapa: Etapa; pct: number; detalle: string }
  | { estado: "lista"; resumen: Resumen }
  | { estado: "fallida"; mensaje: string };

type EventoCarga =
  | { tipo: "progreso"; etapa: Etapa; pct: number; detalle: string }
  | ({ tipo: "listo" } & Resumen)
  | { tipo: "cancelado" | "error"; mensaje: string };

type EventoFinal = Exclude<EventoCarga, { tipo: "progreso" }>;

class CargaCancelada extends Error {}

const esperar = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolver, rechazar) => {
    const temporizador = setTimeout(resolver, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(temporizador);
        rechazar(new CargaCancelada());
      },
      { once: true },
    );
  });

const mensajeError = (texto: string, status: number) => {
  try {
    return (JSON.parse(texto).error as ErrorApi | undefined) ?? null;
  } catch {
    return status ? { codigo: "HTTP", mensaje: `Error inesperado (${status}).` } : null;
  }
};

type RespuestaParte = { status: number; texto: string; reintentarEn: number };

/**
 * Una parte por XMLHttpRequest y no fetch: es la unica forma de medir el avance
 * mientras los bytes salen del navegador.
 */
function enviarParte(
  url: string,
  parte: Blob,
  signal: AbortSignal,
  alEnviar: (bytes: number) => void,
) {
  return new Promise<RespuestaParte>((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    const abortar = () => xhr.abort();
    signal.addEventListener("abort", abortar, { once: true });
    const terminar = () => signal.removeEventListener("abort", abortar);
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (evento) => alEnviar(evento.loaded);
    xhr.onload = () => {
      terminar();
      resolver({
        status: xhr.status,
        texto: xhr.responseText,
        reintentarEn: Number(xhr.getResponseHeader("Retry-After") ?? 0) * 1000,
      });
    };
    // Error de red: se trata como reintentable (status 0).
    xhr.onerror = () => {
      terminar();
      resolver({ status: 0, texto: "", reintentarEn: 0 });
    };
    xhr.onabort = () => {
      terminar();
      rechazar(new CargaCancelada());
    };
    xhr.send(parte);
  });
}

const REINTENTOS = 5;

/**
 * Sube el libro en partes (ver app/lib/api/subidas.ts) y luego pide procesarlo;
 * el servidor responde NDJSON con el avance del pipeline. Cada parte que falla
 * por red, 5xx o limite de peticiones se reintenta sin reiniciar la subida.
 * `cancelar` corta lo que este en curso: si ya se estaba procesando, el
 * servidor aborta el pipeline y hace ROLLBACK.
 */
function subirExcel(archivo: File, alAvanzar: (evento: Extract<EventoCarga, { tipo: "progreso" }>) => void) {
  const controlador = new AbortController();
  const { signal } = controlador;
  let subida: string | null = null;
  let procesando = false;

  const pedir = async (url: string, init?: RequestInit) => {
    const respuesta = await fetch(url, { ...init, signal }).catch((fallo: unknown) => {
      if (signal.aborted) throw new CargaCancelada();
      throw fallo;
    });
    if (!respuesta.ok) {
      const error = mensajeError(await respuesta.text(), respuesta.status);
      throw new Error(error?.mensaje ?? `Error inesperado (${respuesta.status}).`);
    }
    return respuesta;
  };

  const subir = async () => {
    const abierta = (await (
      await pedir("/api/cargas/subidas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tamano: archivo.size }),
      })
    ).json()) as { id: string; tamano_parte: number };
    subida = abierta.id;

    let desde = 0;
    let fallos = 0;
    while (desde < archivo.size) {
      const parte = archivo.slice(desde, desde + abierta.tamano_parte);
      const base = desde;
      const { status, texto, reintentarEn } = await enviarParte(
        `/api/cargas/subidas/${subida}?desde=${desde}`,
        parte,
        signal,
        (enviados) =>
          alAvanzar({
            tipo: "progreso",
            etapa: "subiendo",
            pct: ((base + enviados) / archivo.size) * 100,
            detalle: `${formatSize(base + enviados)} de ${formatSize(archivo.size)}`,
          }),
      );
      if (status === 200) {
        desde = (JSON.parse(texto) as { recibido: number }).recibido;
        fallos = 0;
        continue;
      }
      const error = mensajeError(texto, status);
      // Un reintento de una parte que si habia llegado: seguir desde donde
      // quedo el servidor.
      if (status === 409 && error?.codigo === "DESFASE") {
        desde = Number(error.detalles?.recibido ?? desde);
        continue;
      }
      const reintentable = status === 0 || status === 429 || status >= 500 || status === 400;
      if (!reintentable || ++fallos > REINTENTOS) {
        throw new Error(error?.mensaje ?? "No se pudo subir el archivo. Revisa la conexión e inténtalo de nuevo.");
      }
      const espera = Math.max(reintentarEn, 1000 * 2 ** (fallos - 1));
      alAvanzar({
        tipo: "progreso",
        etapa: "subiendo",
        pct: (desde / archivo.size) * 100,
        detalle:
          status === 429
            ? `Servidor ocupado; se reanuda en ${Math.round(espera / 1000)} s…`
            : `Reintentando (${fallos} de ${REINTENTOS})…`,
      });
      await esperar(espera, signal);
    }
  };

  const procesar = async () => {
    const respuesta = await pedir("/api/cargas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subida }),
    });
    // Desde aqui el servidor es dueno del archivo y lo borra al terminar.
    procesando = true;
    const lector = respuesta.body!.pipeThrough(new TextDecoderStream()).getReader();
    let pendiente = "";
    let final: EventoFinal | null = null;
    while (true) {
      const { value, done } = await lector.read().catch((fallo: unknown) => {
        if (signal.aborted) throw new CargaCancelada();
        throw fallo;
      });
      if (done) break;
      pendiente += value;
      const lineas = pendiente.split("\n");
      pendiente = lineas.pop() ?? "";
      for (const linea of lineas) {
        if (!linea.trim()) continue;
        const evento = JSON.parse(linea) as EventoCarga;
        if (evento.tipo === "progreso") alAvanzar(evento);
        else final = evento;
      }
    }
    return final as EventoFinal | null;
  };

  const promesa = (async (): Promise<Resumen> => {
    try {
      await subir();
      const ultimo = await procesar();
      if (ultimo?.tipo === "listo") return ultimo;
      if (ultimo?.tipo === "cancelado") throw new CargaCancelada();
      throw new Error(ultimo?.mensaje ?? "La carga se interrumpió antes de terminar.");
    } catch (fallo) {
      // Si no se llego a procesar, el servidor no borra la subida: se descarta
      // aqui para no dejar el archivo a medias en disco.
      if (subida && !procesando) {
        fetch(`/api/cargas/subidas/${subida}`, { method: "DELETE" }).catch(() => {});
      }
      throw fallo;
    }
  })();

  return { promesa, cancelar: () => controlador.abort() };
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : bytes < 1024 ** 3
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(bytes / 1024 ** 3).toFixed(2)} GB`;

export default function ExcelUploadModal() {
  const [isOpen, setIsOpen] = useModalUpload();
  const pegado = usePegado();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [carga, setCarga] = useState<Carga>({ estado: "inactiva" });
  const cancelarRef = useRef<(() => void) | null>(null);
  const enCurso = carga.estado === "en_curso";
  const [vistaBorrar, setVistaBorrar] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, setIsOpen]);

  async function accept(candidate: File | undefined) {
    if (!candidate) return;

    const message = await validateXlsx(candidate);

    if (message) {
      setFile(null);
      setError(message);
      toast.error(message);
      return;
    }

    setError(null);
    setFile(candidate);
    setCarga({ estado: "inactiva" });
    toast.success(`Archivo validado: ${candidate.name}`);
  }

  function reset() {
    setFile(null);
    setError(null);
    setCarga({ estado: "inactiva" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function cargar() {
    if (!file || enCurso) return;
    setCarga({ estado: "en_curso", etapa: "subiendo", pct: 0, detalle: "Iniciando" });
    const { promesa, cancelar } = subirExcel(file, ({ etapa, pct, detalle }) => {
      const total =
        etapa === "subiendo"
          ? (pct * TRAMO_SUBIDA) / 100
          : TRAMO_SUBIDA + (pct * (100 - TRAMO_SUBIDA)) / 100;
      setCarga({ estado: "en_curso", etapa, pct: total, detalle });
    });
    cancelarRef.current = cancelar;
    try {
      const resumen = await promesa;
      setCarga({ estado: "lista", resumen });
      toast.success(`${resumen.leidas.toLocaleString("es-CO")} ventas cargadas`);
    } catch (fallo) {
      if (fallo instanceof CargaCancelada) {
        setCarga({ estado: "inactiva" });
        toast("Carga cancelada. La base quedó sin cambios.");
      } else {
        const mensaje = fallo instanceof Error ? fallo.message : "No se pudo cargar el archivo.";
        setCarga({ estado: "fallida", mensaje });
        toast.error(mensaje);
      }
    } finally {
      cancelarRef.current = null;
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label="Cargar Excel con información maestra"
        className={`fixed top-4 right-4 z-40 h-11 w-11 items-center justify-center rounded-full text-brand transition-opacity hover:opacity-60 sm:right-6 sm:top-6 ${
          pegado ? "hidden" : "hidden sm:flex"
        }`}
      >
        <UploadCloud aria-hidden="true" className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 sm:p-6"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="excel-upload-title"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-2xl rounded-2xl bg-background p-6 shadow-[0_10px_30px_rgba(0,0,0,0.15)] sm:p-10"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="excel-upload-title"
                    className="text-3xl leading-tight font-bold tracking-tight"
                  >
                    Cargar <span className="text-[#c28e4b]">Excel</span> con
                    información maestra
                  </h2>
                  <p className="mt-3 max-w-prose text-sm leading-6 text-foreground/70">
                    Adjunta el libro con los datos base de clientes, materiales,
                    asesores y sedes. Validamos el formato y la integridad del
                    archivo antes de procesarlo.
                  </p>
                </div>
                <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setVistaBorrar(true)}
                    disabled={enCurso || vistaBorrar}
                    aria-label="Borrar los datos actuales"
                    title="Borrar los datos actuales"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-red-800/10 hover:text-red-800 disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 aria-hidden="true" className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Cerrar"
                    autoFocus
                    className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
                  >
                    <X aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {vistaBorrar ? (
                <BorrarDatos onVolver={() => setVistaBorrar(false)} />
              ) : (
                <div className="mt-8">
                  {file ? (
                    <div className="flex items-center gap-4 rounded-2xl border border-brand/20 bg-brand/5 p-5">
                      <FileSpreadsheet
                        aria-hidden="true"
                        className="h-8 w-8 shrink-0 text-[#c28e4b]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{file.name}</p>
                        <p className="text-sm text-foreground/60">
                          {formatSize(file.size)} · Formato verificado
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={reset}
                        disabled={enCurso}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                        aria-label={`Quitar ${file.name}`}
                      >
                        <X aria-hidden="true" className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsDragging(false);
                        accept(event.dataTransfer.files[0]);
                      }}
                      aria-describedby={error ? "excel-upload-error" : undefined}
                      className={`flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-14 transition-colors ${
                        isDragging
                          ? "border-brand bg-brand/10"
                          : "border-foreground/20 hover:border-brand/50 hover:bg-foreground/5"
                      }`}
                    >
                      <UploadCloud
                        aria-hidden="true"
                        className="h-10 w-10 text-brand"
                      />
                      <span className="text-center font-medium">
                        Arrastra el archivo aquí o haz clic para seleccionarlo
                      </span>
                      <span className="text-sm text-foreground/60">
                        Solo libros .xlsx, hasta 1,5 GB
                      </span>
                    </button>
                  )}

                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    onChange={(event) => {
                      accept(event.target.files?.[0]);
                    }}
                  />

                  {error && (
                    <p
                      id="excel-upload-error"
                      role="alert"
                      className="mt-4 text-sm leading-6 text-red-800"
                    >
                      {error}
                    </p>
                  )}

                  {file && carga.estado !== "inactiva" && (
                    <ProgresoCarga carga={carga} />
                  )}

                  {file && (
                    <div className="mt-6 flex flex-wrap justify-end gap-3">
                      {carga.estado === "lista" && (
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="flex h-11 items-center gap-2 rounded-full px-6 font-medium text-foreground/80 transition-colors hover:bg-foreground/10"
                        >
                          <RefreshCw aria-hidden="true" className="h-4 w-4" />
                          Ver datos actualizados
                        </button>
                      )}
                      {enCurso && (
                        <button
                          type="button"
                          onClick={() => cancelarRef.current?.()}
                          className="h-11 rounded-full border border-red-800/30 px-8 font-medium text-red-800 transition-colors hover:bg-red-800/10"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={cargar}
                        disabled={enCurso}
                        aria-busy={enCurso}
                        className="flex h-11 items-center gap-2 rounded-full bg-[#1f1f1f] px-8 font-medium text-background transition-opacity hover:opacity-85 active:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {enCurso && (
                          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                        )}
                        {enCurso ? "Cargando…" : carga.estado === "lista" ? "Cargar de nuevo" : "Cargar"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ProgresoCarga({ carga }: { carga: Exclude<Carga, { estado: "inactiva" }> }) {
  if (carga.estado === "fallida") {
    return (
      <p role="alert" className="mt-6 text-sm leading-6 text-red-800">
        {carga.mensaje}
      </p>
    );
  }

  if (carga.estado === "lista") {
    const { cargado, leidas } = carga.resumen;
    return (
      <div role="status" className="mt-6 rounded-2xl bg-foreground/5 p-5 text-sm leading-6">
        <p className="flex items-center gap-2 font-medium">
          <Check aria-hidden="true" className="h-4 w-4 text-brand" />
          Carga completa
        </p>
        <p className="mt-1 text-foreground/70">
          {leidas.toLocaleString("es-CO")} filas de ventas procesadas. En la base:{" "}
          {(cargado.ventas ?? 0).toLocaleString("es-CO")} ventas,{" "}
          {(cargado.clientes ?? 0).toLocaleString("es-CO")} clientes,{" "}
          {(cargado.materiales ?? 0).toLocaleString("es-CO")} materiales y{" "}
          {(cargado.asesores ?? 0).toLocaleString("es-CO")} asesores.
        </p>
      </div>
    );
  }

  const actual = ETAPAS.findIndex((etapa) => etapa.id === carga.etapa);
  const pct = Math.round(carga.pct);

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">{ETAPAS[actual]?.nombre}</span>
        <span className="tabular-nums text-foreground/60">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Avance de la carga"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% · ${ETAPAS[actual]?.nombre}`}
        className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
          style={{ width: `${carga.pct}%` }}
        />
      </div>
      <p className="mt-2 text-sm tabular-nums text-foreground/60" aria-live="polite">
        {carga.detalle}
      </p>

      <ol className="mt-4 space-y-1.5 text-sm">
        {ETAPAS.map((etapa, i) => {
          const hecha = i < actual;
          const activa = i === actual;
          return (
            <li
              key={etapa.id}
              className={`flex items-center gap-2 ${
                activa ? "font-medium" : hecha ? "text-foreground/70" : "text-foreground/40"
              }`}
            >
              {hecha ? (
                <Check aria-hidden="true" className="h-4 w-4 text-brand" />
              ) : activa ? (
                <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-brand" />
              ) : (
                <Circle aria-hidden="true" className="h-4 w-4" />
              )}
              {etapa.nombre}
              <span className="sr-only">{hecha ? "(hecho)" : activa ? "(en curso)" : "(pendiente)"}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type Conteo = { ventas: number; clientes: number; materiales: number; asesores: number };

const describirConteo = ({ ventas, clientes, materiales, asesores }: Conteo) =>
  `${ventas.toLocaleString("es-CO")} ventas, ${clientes.toLocaleString("es-CO")} clientes, ` +
  `${materiales.toLocaleString("es-CO")} materiales y ${asesores.toLocaleString("es-CO")} asesores`;

type EstadoBorrado =
  | { fase: "contando" }
  | { fase: "confirmar"; conteo: Conteo }
  | { fase: "borrando"; conteo: Conteo }
  | { fase: "hecho"; borrado: Conteo }
  | { fase: "fallido"; mensaje: string };

const mensajeDe = async (respuesta: Response) => {
  const cuerpo = await respuesta.json().catch(() => null);
  return (cuerpo?.error as ErrorApi | undefined)?.mensaje ?? `Error inesperado (${respuesta.status}).`;
};

/**
 * Confirmacion para vaciar ventas y maestras (DELETE /api/cargas). Muestra
 * cuantas filas se pierden antes de pedir el si definitivo.
 */
function BorrarDatos({ onVolver }: { onVolver: () => void }) {
  const [estado, setEstado] = useState<EstadoBorrado>({ fase: "contando" });

  useEffect(() => {
    const controlador = new AbortController();
    fetch("/api/cargas", { signal: controlador.signal })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error(await mensajeDe(respuesta));
        const { actual } = (await respuesta.json()) as { actual: Conteo };
        setEstado({ fase: "confirmar", conteo: actual });
      })
      .catch((fallo: unknown) => {
        if (fallo instanceof DOMException && fallo.name === "AbortError") return;
        setEstado({
          fase: "fallido",
          mensaje: fallo instanceof Error ? fallo.message : "No se pudo consultar la base.",
        });
      });
    return () => controlador.abort();
  }, []);

  async function borrar(conteo: Conteo) {
    setEstado({ fase: "borrando", conteo });
    try {
      const respuesta = await fetch("/api/cargas", { method: "DELETE" });
      if (!respuesta.ok) throw new Error(await mensajeDe(respuesta));
      const { borrado } = (await respuesta.json()) as { borrado: Conteo };
      setEstado({ fase: "hecho", borrado });
      toast.success("Datos borrados");
    } catch (fallo) {
      const mensaje = fallo instanceof Error ? fallo.message : "No se pudieron borrar los datos.";
      setEstado({ fase: "fallido", mensaje });
      toast.error(mensaje);
    }
  }

  const volver = (
    <button
      type="button"
      onClick={onVolver}
      className="h-11 rounded-full px-6 font-medium text-foreground/80 transition-colors hover:bg-foreground/10"
    >
      Volver
    </button>
  );

  if (estado.fase === "hecho") {
    return (
      <div className="mt-8">
        <div role="status" className="rounded-2xl bg-foreground/5 p-5 text-sm leading-6">
          <p className="flex items-center gap-2 font-medium">
            <Check aria-hidden="true" className="h-4 w-4 text-brand" />
            Datos borrados
          </p>
          <p className="mt-1 text-foreground/70">
            Se eliminaron {describirConteo(estado.borrado)}. Carga un Excel para volver a llenar la base.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex h-11 items-center gap-2 rounded-full px-6 font-medium text-foreground/80 transition-colors hover:bg-foreground/10"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Ver datos actualizados
          </button>
          <button
            type="button"
            onClick={onVolver}
            className="h-11 rounded-full bg-[#1f1f1f] px-8 font-medium text-background transition-opacity hover:opacity-85 active:opacity-70"
          >
            Cargar Excel
          </button>
        </div>
      </div>
    );
  }

  if (estado.fase === "fallido") {
    return (
      <div className="mt-8">
        <p role="alert" className="text-sm leading-6 text-red-800">
          {estado.mensaje}
        </p>
        <div className="mt-6 flex justify-end">{volver}</div>
      </div>
    );
  }

  const conteo = estado.fase === "contando" ? null : estado.conteo;
  const borrando = estado.fase === "borrando";
  const vacia = conteo !== null && conteo.ventas + conteo.clientes + conteo.materiales + conteo.asesores === 0;

  return (
    <div className="mt-8">
      <div
        role="alertdialog"
        aria-labelledby="borrar-titulo"
        aria-describedby="borrar-detalle"
        className="rounded-2xl border border-red-800/20 bg-red-800/5 p-5"
      >
        <p id="borrar-titulo" className="flex items-center gap-2 font-medium text-red-800">
          <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
          ¿Borrar los datos actuales?
        </p>
        <p id="borrar-detalle" className="mt-2 text-sm leading-6 text-foreground/80">
          {conteo === null
            ? "Consultando cuántos datos hay en la base…"
            : vacia
              ? "La base ya está vacía: no hay datos que borrar."
              : `Se eliminarán ${describirConteo(conteo)}. Esta acción no se puede deshacer; para recuperarlos tendrás que volver a cargar el Excel.`}
        </p>
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {!borrando && volver}
        <button
          type="button"
          onClick={() => conteo && borrar(conteo)}
          disabled={conteo === null || vacia || borrando}
          aria-busy={borrando}
          className="flex h-11 items-center gap-2 rounded-full bg-red-800 px-8 font-medium text-white transition-opacity hover:opacity-90 active:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {borrando ? (
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          )}
          {borrando ? "Borrando…" : "Sí, borrar todo"}
        </button>
      </div>
    </div>
  );
}
