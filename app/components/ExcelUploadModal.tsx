"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

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

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function ExcelUploadModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, [isOpen]);

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
    toast.success(`Archivo validado: ${candidate.name}`);
  }

  function reset() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label="Cargar Excel con información maestra"
        className="fixed right-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-full text-brand transition-opacity hover:opacity-60 sm:right-6 sm:top-6"
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
                    className="font-montserrat text-3xl leading-tight font-bold tracking-tight"
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
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Cerrar"
                  autoFocus
                  className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>

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
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
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

                {file && (
                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        toast.success(`${file.name} listo para cargar`)
                      }
                      className="h-11 rounded-full bg-[#1f1f1f] px-8 font-medium text-background transition-opacity hover:opacity-85 active:opacity-70"
                    >
                      Cargar
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
