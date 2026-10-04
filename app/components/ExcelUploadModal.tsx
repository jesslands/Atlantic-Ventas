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

/**
 * XMLHttpRequest y no fetch: es la unica forma de medir el avance de la subida.
 * El servidor responde NDJSON, que se va leyendo de responseText a medida que
 * llega. `cancelar` corta la conexion; el servidor lo detecta, aborta el
 * pipeline y hace ROLLBACK.
 */
function subirExcel(archivo: File, alAvanzar: (evento: Extract<EventoCarga, { tipo: "progreso" }>) => void) {
  const xhr = new XMLHttpRequest();
  const promesa = new Promise<Resumen>((resolver, rechazar) => {
    let leido = 0;
    let final: EventoFinal | null = null;

    const procesar = () => {
      const texto = xhr.responseText;
      const corte = texto.lastIndexOf("\n");
      if (corte < leido) return;
      for (const linea of texto.slice(leido, corte).split("\n")) {
        if (!linea.trim()) continue;
        const evento = JSON.parse(linea) as EventoCarga;
        if (evento.tipo === "progreso") alAvanzar(evento);
        else final = evento;
      }
      leido = corte + 1;
    };

    xhr.open("POST", "/api/cargas");
    xhr.setRequestHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    xhr.upload.onprogress = (evento) => {
      if (!evento.lengthComputable) return;
      alAvanzar({
        tipo: "progreso",
        etapa: "subiendo",
        pct: (evento.loaded / evento.total) * 100,
        detalle: `${formatSize(evento.loaded)} de ${formatSize(evento.total)}`,
      });
    };
    xhr.onprogress = () => {
      if (xhr.status === 200) procesar();
    };
    xhr.onload = () => {
      if (xhr.status !== 200) {
        let mensaje = `Error inesperado (${xhr.status}).`;
        try {
          mensaje = JSON.parse(xhr.responseText).error?.mensaje ?? mensaje;
        } catch {}
        rechazar(new Error(mensaje));
        return;
      }
      procesar();
      const ultimo = final as EventoFinal | null;
      if (ultimo?.tipo === "listo") resolver(ultimo);
      else if (ultimo?.tipo === "cancelado") rechazar(new CargaCancelada());
      else rechazar(new Error(ultimo?.mensaje ?? "La carga se interrumpió antes de terminar."));
    };
    xhr.onerror = () => rechazar(new Error("Se perdió la conexión con el servidor."));
    xhr.onabort = () => rechazar(new CargaCancelada());
    xhr.send(archivo);
  });
  return { promesa, cancelar: () => xhr.abort() };
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

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
                        Solo se aceptan libros .xlsx
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
