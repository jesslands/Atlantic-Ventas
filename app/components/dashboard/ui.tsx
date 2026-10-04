import { ArrowDownRight, ArrowUpRight, RotateCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

const SUPERFICIE =
  "rounded-2xl bg-superficie shadow-[0_1px_2px_rgba(87,82,44,0.06),0_12px_32px_-18px_rgba(87,82,44,0.28)]";

export function Esqueleto({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`esqueleto rounded-xl ${className}`} />;
}

/**
 * Estado de una vista que depende de uno o más `useApi`: esqueleto con la
 * forma del tablero mientras carga, o un error que dice qué pasó y cómo
 * reintentar.
 */
export function EstadoCarga({ error }: { error: string | null }) {
  if (error) {
    return (
      <div role="alert" className={`${SUPERFICIE} mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center`}>
        <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-negativo" />
        <div className="flex-1 text-sm">
          <p className="font-medium">No se pudieron cargar los datos.</p>
          <p className="mt-0.5 text-tinta-3">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="presionable inline-flex h-11 items-center gap-2 self-start rounded-full bg-brand px-4 text-sm font-medium text-background sm:self-auto"
        >
          <RotateCw aria-hidden="true" className="h-4 w-4" />
          Reintentar
        </button>
      </div>
    );
  }
  return (
    <div role="status" aria-label="Cargando datos" className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className="flex flex-wrap gap-2 lg:col-span-12">
        <Esqueleto className="h-10 w-44 rounded-full" />
        <Esqueleto className="h-10 w-36 rounded-full" />
        <Esqueleto className="h-10 w-44 rounded-full" />
        <Esqueleto className="h-10 w-40 rounded-full" />
      </div>
      <Esqueleto className="h-80 lg:col-span-12" />
      <Esqueleto className="h-72 lg:col-span-7" />
      <Esqueleto className="h-72 lg:col-span-5" />
    </div>
  );
}

export function Tarjeta({
  titulo,
  subtitulo,
  accion,
  children,
  className = "",
}: {
  titulo?: string;
  subtitulo?: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${SUPERFICIE} p-4 sm:p-6 ${className}`}>
      {(titulo || accion) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {titulo && <h2 className="text-[0.95rem] leading-6 font-semibold">{titulo}</h2>}
            {subtitulo && <p className="mt-0.5 text-xs leading-5 text-tinta-3">{subtitulo}</p>}
          </div>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

/** Variación con flecha + signo + color: la dirección nunca depende solo del color. */
export function Delta({ valor, maloSiSube = false }: { valor: number; maloSiSube?: boolean }) {
  const malo = maloSiSube ? valor > 0 : valor < 0;
  const Flecha = valor >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
        malo ? "bg-negativo/10 text-negativo" : "bg-dato/10 text-dato"
      }`}
    >
      <Flecha aria-hidden="true" className="mr-0.5 h-3.5 w-3.5" />
      {Math.abs(valor).toFixed(1).replace(".", ",").replace(/,0$/, "")}%
    </span>
  );
}

/** Fila de badges de indicadores. `nota` aclara la comparación una sola vez. */
export function Indicadores({ children, nota }: { children: ReactNode; nota?: string }) {
  return (
    <div className="mt-6">
      <ul
        aria-label="Indicadores"
        className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-0.5 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      {nota && <p className="mt-1 px-1 text-xs text-tinta-3">{nota}</p>}
    </div>
  );
}

export function Kpi({
  titulo,
  valor,
  delta = null,
  detalle,
  maloSiSube = false,
}: {
  titulo: string;
  valor: string;
  delta?: number | null;
  detalle?: string;
  maloSiSube?: boolean;
}) {
  return (
    <li className="inline-flex h-10 shrink-0 snap-start items-center gap-2 rounded-full bg-superficie pr-2 pl-3.5 shadow-[0_1px_2px_rgba(87,82,44,0.08),0_4px_12px_-8px_rgba(87,82,44,0.3)]">
      <span className="truncate text-xs text-tinta-3">{titulo}</span>
      <span className="text-sm font-semibold whitespace-nowrap">{valor}</span>
      {detalle && <span className="text-xs whitespace-nowrap text-tinta-3">{detalle}</span>}
      {delta !== null ? <Delta valor={delta} maloSiSube={maloSiSube} /> : <span aria-hidden="true" className="w-1.5" />}
    </li>
  );
}

/** Botón "volver" compartido por las fichas de asesor y cliente. */
export function Volver({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="presionable inline-flex h-11 items-center gap-2 rounded-full bg-superficie px-4 text-sm font-medium shadow-[0_1px_2px_rgba(87,82,44,0.08)] hover:bg-white"
    >
      {children}
    </button>
  );
}
